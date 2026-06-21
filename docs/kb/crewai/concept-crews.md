## Crews

A **Crew** is the top-level orchestration unit in CrewAI: it holds a list of `Agent` objects, a list of `Task` objects, and a `Process` that controls how those tasks are executed. Calling `crew.kickoff()` launches the run and returns a `CrewOutput`.

### What it is / when to use it

Use a Crew whenever you need multiple agents to collaborate on a shared goal. The Crew handles task routing, context passing between tasks, memory (optional), and result aggregation. You do not manage inter-agent communication manually — the Crew does it through the Process you choose:

| Process | Behaviour |
|---|---|
| `Process.sequential` | Tasks run one after another; each task's output is available as context to the next. Default and simplest. |
| `Process.hierarchical` | A manager agent delegates tasks to specialist agents and reviews their outputs. Requires `manager_llm` or a `manager_agent`. |

### Minimal correct example

```python
from crewai import Agent, Crew, Process, Task

researcher = Agent(
    role="Researcher",
    goal="Gather relevant data on {topic}",
    backstory="Experienced analyst with a passion for uncovering insights",
)

writer = Agent(
    role="Writer",
    goal="Turn research into a clear report",
    backstory="Skilled writer who makes complex topics accessible",
)

research_task = Task(
    description="Collect the key facts about {topic}.",
    expected_output="Bullet-point research notes",
    agent=researcher,
)

writing_task = Task(
    description="Write a short report based on the research.",
    expected_output="A concise markdown report",
    agent=writer,
    context=[research_task],   # receives researcher output automatically
)

crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, writing_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "AI agents"})
print(result)           # CrewOutput with .raw, .tasks_output, etc.
```

### Gotchas

1. **Task order matters in sequential process.** Tasks are executed in the exact order of the `tasks` list, not the order agents appear. If `writing_task` needs `research_task`'s output, `research_task` must come first in the list *and* `writing_task` must declare `context=[research_task]` — forgetting `context` means the writer never sees the researcher's output even though sequential order is correct.

2. **`kickoff()` is synchronous and blocking.** For async use or parallel execution, use `kickoff_async()` or `kickoff_for_each_async()`. Running `kickoff()` inside an already-running event loop (e.g., inside a FastAPI endpoint without `asyncio.run`) will raise a `RuntimeError`.
