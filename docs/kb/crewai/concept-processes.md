## Processes

A **Process** is the execution strategy that governs how a `Crew` runs its tasks. It controls whether agents work in a fixed order or under a manager that dynamically delegates work.

### What it is / when to use it

`Process` is an enum imported from `crewai`. There are two live options:

| Value | Behavior | When to use |
|---|---|---|
| `Process.sequential` | Tasks run in definition order; the output of each task is injected as context for the next. | Default for most crews. Clear pipeline stages (research → write → review). |
| `Process.hierarchical` | A manager agent (or manager LLM) receives all tasks and delegates them to the most capable specialist agent at runtime. | Complex projects where task routing depends on agent capabilities, or when the number/order of tasks is not fully predictable upfront. |

`Process.sequential` is the default — you do not have to set it explicitly. `Process.hierarchical` requires either `manager_llm` or `manager_agent` to be set on the `Crew`, otherwise instantiation raises a `ValueError`.

### Minimal correct code snippet

```python
from crewai import Agent, Crew, Process, Task

researcher = Agent(
    role="Researcher",
    goal="Find relevant facts",
    backstory="Tenacious analyst.",
)
writer = Agent(
    role="Writer",
    goal="Turn facts into prose",
    backstory="Clear communicator.",
)

research_task = Task(
    description="Research quantum computing advances in 2025.",
    expected_output="Bullet-point summary of key advances.",
    agent=researcher,
)
writing_task = Task(
    description="Write a 300-word article using the research.",
    expected_output="A polished article ready to publish.",
    agent=writer,
    context=[research_task],  # explicit dependency; still sequential
)

# Sequential (default — explicit here for clarity)
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff()

# Hierarchical variant — swap the Crew instantiation:
# crew = Crew(
#     agents=[researcher, writer],
#     tasks=[research_task, writing_task],
#     process=Process.hierarchical,
#     manager_llm="gpt-4o",  # required
# )
```

### Gotchas

1. **`Process.hierarchical` silently re-orders or re-assigns tasks.** The manager decides which agent handles each task at runtime, so pre-assigning `agent=` on a `Task` is treated as a hint, not a guarantee. If you need a strict agent-to-task binding, use `Process.sequential` and set `agent=` explicitly on each task.

2. **`context=[...]` is not the same as sequential order.** In `Process.sequential`, every prior task's output is available as implicit context for the next task in list order. The `context` parameter on `Task` lets you declare explicit cross-task dependencies that override or supplement that implicit chain — useful when a downstream task should skip intermediate tasks or when running `Process.hierarchical` where order is not fixed. Omitting `context` does not mean the task runs without information; it means it relies on the implicit sequential context window.
