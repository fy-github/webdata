function createTask(id, type, title, details = {}) {
  return {
    id: `task_${id}`,
    type,
    title,
    ...details
  };
}

export function buildSummaryBundle(actions = []) {
  const tasks = [];
  let taskId = 1;
  let index = 0;

  while (index < actions.length) {
    const action = actions[index];

    if (action.type === "navigation") {
      tasks.push(createTask(taskId++, "page_visit", `打开页面 ${action.page?.title || action.page?.url || ""}`.trim(), {
        startActionId: action.id,
        endActionId: action.id,
        url: action.page?.url || ""
      }));
      index += 1;
      continue;
    }

    if (action.type === "input" || action.type === "change") {
      const grouped = [action];
      let pointer = index + 1;
      while (pointer < actions.length && (actions[pointer].type === "input" || actions[pointer].type === "change")) {
        grouped.push(actions[pointer]);
        pointer += 1;
      }

      tasks.push(createTask(taskId++, "form_fill", "填写表单", {
        startActionId: grouped[0].id,
        endActionId: grouped[grouped.length - 1].id,
        fields: [...new Set(grouped.map((item) => item.target?.name || item.target?.selector || "").filter(Boolean))]
      }));
      index = pointer;
      continue;
    }

    if (
      action.type === "click" &&
      action.target?.selector?.includes("submit") &&
      actions[index + 1]?.type === "navigation"
    ) {
      tasks.push(createTask(taskId++, "submit_and_navigate", "提交表单并跳转", {
        startActionId: action.id,
        endActionId: actions[index + 1].id,
        triggerSelector: action.target.selector,
        destinationUrl: actions[index + 1].page?.url || ""
      }));
      index += 2;
      continue;
    }

    if (action.type === "click") {
      tasks.push(createTask(taskId++, "action_trigger", "触发页面操作", {
        startActionId: action.id,
        endActionId: action.id,
        triggerSelector: action.target?.selector || ""
      }));
    }

    index += 1;
  }

  return {
    tasks,
    stats: {
      taskCount: tasks.length,
      actionCount: actions.length
    }
  };
}
