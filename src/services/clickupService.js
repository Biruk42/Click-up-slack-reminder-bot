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
  const tasks = data.tasks.map((t) => {
    const statusUpdateField = t.custom_fields?.find(
      (f) => f.name.toLowerCase() === "status update"
    );

    const statusUpdateValue =
      statusUpdateField?.value && typeof statusUpdateField.value === "string"
        ? statusUpdateField.value.trim()
        : null;

    return {
      name: t.name,
      status: t.status.status.toLowerCase(),
      time_spent: t.time_spent || 0,
      assignees: t.assignees.map((a) => a.username),
      url: t.url,
      spaceName: t.space?.name || "",
      status_update: statusUpdateValue,
      status_update_date: statusUpdateField?.date_updated
        ? new Date(Number(statusUpdateField.date_updated))
        : null,
    };
  });

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
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  return tasks.filter((t) => {
    const isRelevantStatus = config.relevantStatuses.some((status) =>
      t.status.includes(status)
    );

    if (!isRelevantStatus) return false;

    const noTimeTracked = t.time_spent === 0;

    const noRecentStatusUpdate =
      !t.status_update ||
      !t.status_update_date ||
      !isSameDay(new Date(t.status_update_date), today);

    return noTimeTracked || noRecentStatusUpdate;
  });
}
