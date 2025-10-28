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
  const tasks = data.tasks.map((t) => ({
    name: t.name,
    status: t.status.status.toLowerCase(),
    time_spent: t.time_spent || 0,
    assignees: t.assignees.map((a) => a.username),
    url: t.url,
  }));
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

export function filterMissingTimeTasks(tasks) {
  return tasks.filter(
    (t) =>
      config.relevantStatuses.some((status) => t.status.includes(status)) &&
      t.time_spent === 0
  );
}
