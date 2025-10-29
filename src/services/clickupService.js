import axios from "axios";
import { config } from "../config/index.js";
import { log, error } from "../utils/logger.js";

const API_BASE = "https://api.clickup.com/api/v2";

async function apiCall(endpoint, params = {}) {
  try {
    const res = await axios.get(`${API_BASE}${endpoint}`, {
      headers: { Authorization: config.clickupToken },
      params,
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    return res.data;
  } catch (err) {
    error(
      `ClickUp API error at ${endpoint}:`,
      err.response?.data || err.message
    );
    throw err;
  }
}

// Fetch all spaces under team
export async function getAllSpaces() {
  const data = await apiCall(`/team/${config.teamId}/space`);
  log(`Fetched ${data.spaces.length} spaces`);
  return data.spaces;
}

// Fetch folders in a space
export async function getFoldersInSpace(spaceId) {
  const data = await apiCall(`/space/${spaceId}/folder`);
  log(`Fetched ${data.folders.length} folders in space ${spaceId}`);
  return data.folders;
}

// Fetch lists (sprints) in a folder
export async function getListsInFolder(folderId) {
  const data = await apiCall(`/folder/${folderId}/list`);
  log(`Fetched ${data.lists.length} lists in folder ${folderId}`);
  return data.lists;
}

// Fetch tasks in a list
export async function getTasksInList(listId) {
  const data = await apiCall(`/list/${listId}/task`, { include_closed: true });

  // Helper to fetch comments for a task
  async function getTaskComments(taskId) {
    try {
      const commentsData = await apiCall(`/task/${taskId}/comment`);
      await new Promise((r) => setTimeout(r, 100));
      return commentsData.comments || [];
    } catch (err) {
      error(`Failed to fetch comments for task ${taskId}`, err.message);
      return [];
    }
  }

  const tasks = [];

  for (const t of data.tasks) {
    if (!t.status || !t.status.status) continue;
    const status = t.status.status.toLowerCase();

    let assigneeFieldName = "assignee";
    let timeTrackedFieldName = "time tracked";

    if (status === "code review") {
      assigneeFieldName = "code review & qa";
      timeTrackedFieldName = "code reviewer & qa time tracked";
    } else if (status === "ready to prod") {
      assigneeFieldName = "deployer";
      timeTrackedFieldName = "deployer time tracked";
    }

    const findField = (name) =>
      t.custom_fields?.find(
        (f) => f.name && f.name.toLowerCase() === name.toLowerCase()
      );

    const assigneeField = findField(assigneeFieldName);
    const timeTrackedField = findField(timeTrackedFieldName);

    let assignees = [];
    if (["code review", "ready to prod"].includes(status)) {
      if (assigneeField?.value && Array.isArray(assigneeField.value)) {
        assignees = assigneeField.value
          .map((v) => v.username || v.name)
          .filter(Boolean);
      } else {
        assignees = [];
      }
    } else {
      assignees =
        assigneeField?.value && Array.isArray(assigneeField.value)
          ? assigneeField.value.map((v) => v.username || v.name).filter(Boolean)
          : t.assignees.map((a) => a.username || a.name).filter(Boolean);
    }

    const timeTrackedValue = ["code review", "ready to prod"].includes(status)
      ? Number(timeTrackedField?.value || 0)
      : Number(timeTrackedField?.value || 0);

    const comments = await getTaskComments(t.id);
    const today = new Date();
    const isSameDay = (d1, d2) =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
    const lastComment = comments
      .filter((c) => {
        const commenterName = c.user?.username || c.user?.name || "";
        return (
          commenterName &&
          assignees.some(
            (a) =>
              a.toLowerCase().replace(/\s+/g, "") ===
              commenterName.toLowerCase().replace(/\s+/g, "")
          )
        );
      })
      .sort((a, b) => Number(b.date) - Number(a.date))[0];

    const lastCommentDate = lastComment
      ? new Date(Number(lastComment.date))
      : null;
    tasks.push({
      name: t.name,
      status,
      time_spent: timeTrackedValue,
      assignees,
      url: t.url,
      spaceName: t.space?.name || "",
      last_comment_date: lastCommentDate,
    });
  }

  log(`Fetched ${tasks.length} tasks in list ${listId}`);
  return tasks;
}

export async function getAllRelevantTasks() {
  const allTasks = [];
  const spaces = await getAllSpaces();

  for (const space of spaces) {
    const spaceName = space.name;

    if (!config.trackedSpaces.includes(spaceName)) {
      continue;
    }

    const folders = await getFoldersInSpace(space.id);
    for (const folder of folders) {
      const lists = await getListsInFolder(folder.id);
      for (const list of lists) {
        const tasks = await getTasksInList(list.id);
        const tasksWithSpace = tasks.map((t) => ({
          ...t,
          spaceName: spaceName,
        }));
        allTasks.push(...tasksWithSpace);
      }
    }
  }

  log(`Total tasks across all spaces/folders/lists: ${allTasks.length}`);
  return allTasks;
}

export function filterMissingTasks(tasks) {
  const today = new Date();
  const isSameDay = (d1, d2) =>
    d1 &&
    d2 &&
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  return tasks.filter((t) => {
    const isRelevantStatus = config.relevantStatuses.some((status) =>
      t.status.includes(status)
    );
    if (!isRelevantStatus) return false;

    const noTimeTracked = t.time_spent === 0;
    const noRecentComment =
      !t.last_comment_date || !isSameDay(new Date(t.last_comment_date), today);

    return noTimeTracked || noRecentComment;
  });
}
