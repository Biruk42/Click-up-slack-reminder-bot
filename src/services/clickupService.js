import axios from "axios";
import pLimit from "p-limit";
import { config } from "../config/index.js";
import { log, error } from "../utils/logger.js";

const API_BASE = "https://api.clickup.com/api/v2";
const limit = pLimit(5);

async function apiCall(endpoint, params = {}) {
  return limit(async () => {
    try {
      const res = await axios.get(`${API_BASE}${endpoint}`, {
        headers: { Authorization: config.clickupToken },
        params,
      });
      return res.data;
    } catch (err) {
      error(
        `ClickUp API error at ${endpoint}:`,
        err.response?.data || err.message
      );
      throw err;
    }
  });
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
  if (!data.lists) return [];

  const active = [];
  const today = Date.now();

  for (const l of data.lists) {
    const due = l.due_date ? Number(l.due_date) : null;
    const percent = l.percent_complete ?? 0;
    const isDone = percent === 100 || (due && due < today);

    if (!isDone) {
      active.push(l);
    }
  }

  return active;
}

// Fetch tasks in a list
export async function getTasksInList(listId) {
  const data = await apiCall(`/list/${listId}/task`, { include_closed: true });

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

  const tasks = await Promise.all(
    data.tasks.map(async (t) => {
      if (!t.status || !t.status.status) return null;

      const status = t.status.status.toLowerCase();

      let assigneeFieldName = "assignee";
      let timeTrackedFieldName = "time tracked";

      if (status === "code review" || status === "testing") {
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
        if (Array.isArray(assigneeField?.value)) {
          assignees = assigneeField.value
            .map((v) => v.username || v.name)
            .filter(Boolean);
        }
      } else {
        assignees =
          Array.isArray(assigneeField?.value) && assigneeField.value.length
            ? assigneeField.value
                .map((v) => v.username || v.name)
                .filter(Boolean)
            : t.assignees.map((a) => a.username || a.name).filter(Boolean);
      }

      const timeTrackedValue = Number(timeTrackedField?.value || 0);

      const comments = await getTaskComments(t.id);

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

      return {
        name: t.name,
        status,
        time_spent: timeTrackedValue,
        assignees,
        url: t.url,
        spaceName: t.space?.name || "",
        last_comment_date: lastComment
          ? new Date(Number(lastComment.date))
          : null,
      };
    })
  );

  const filteredTasks = tasks.filter(Boolean);
  log(`Fetched ${filteredTasks.length} tasks in list ${listId}`);
  return filteredTasks;
}

export async function getAllRelevantTasks() {
  const allTasks = [];
  const spaces = await getAllSpaces();

  const trackedSpaces = spaces.filter((s) =>
    config.trackedSpaces.includes(s.name)
  );

  for (const space of trackedSpaces) {
    const folders = await getFoldersInSpace(space.id);

    for (const folder of folders) {
      const lists = await getListsInFolder(folder.id);

      if (lists.length === 0) continue;

      const allListTasks = await Promise.all(
        lists.map(async (list) => getTasksInList(list.id))
      );

      for (const tasks of allListTasks) {
        allTasks.push(...tasks.map((t) => ({ ...t, spaceName: space.name })));
      }
    }
  }

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
