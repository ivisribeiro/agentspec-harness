## Tasks

A **Task** is the atomic unit of work assigned to an agent in a CrewAI crew. It bundles the assignment (`description`), the completion contract (`expected_output`), the responsible agent, and optional wiring for tools, structured output, async execution, and inter-task dependencies.

### What it is / when to use it

Use a `Task` whenever you need to hand a discrete, verifiable job to an agent and capture its result. Every `Crew` is assembled from a list of tasks that run in sequence (or in parallel) according to the `Process`. Tasks are also the integration seam for structured output (Pydantic / JSON), file writing, human review gates, and guardrails.

### Minimal correct example

```python
from crewai import Agent, Crew, Process, Task

researcher = Agent(
    role="Researcher",
    goal="Find concise answers",
    backstory="Expert at extracting key facts.",
    llm="gpt-4o-mini",
)

summarise_task = Task(
    description="Summarise the top 3 breakthroughs in {topic} published this year.",
    expected_output="A bullet-point list of exactly 3 breakthroughs with one-line explanations.",
    agent=researcher,
)

crew = Crew(
    agents=[researcher],
    tasks=[summarise_task],
    process=Process.sequential,
    verbose=True,
)

result = crew.kickoff(inputs={"topic": "quantum computing"})
print(result.raw)           # the default string output
print(summarise_task.output.raw)  # same, via the task object
```

**Structured output variant** — swap `expected_output` for a Pydantic model to get a typed result:

```python
from pydantic import BaseModel

class Breakthrough(BaseModel):
    title: str
    summary: str

task = Task(
    description="List the top breakthrough in {topic}.",
    expected_output="A JSON object with title and summary.",
    agent=researcher,
    output_pydantic=Breakthrough,
)
# After kickoff: task.output.pydantic.title
```

**Async + context** — run independent tasks concurrently, then wait on both:

```python
task_a = Task(description="...", expected_output="...", agent=a, async_execution=True)
task_b = Task(description="...", expected_output="...", agent=b, async_execution=True)
task_c = Task(
    description="Combine results from task_a and task_b.",
    expected_output="...",
    agent=c,
    context=[task_a, task_b],   # blocks until both complete
)
```

### Key parameters

| Parameter | Purpose |
|---|---|
| `description` | Natural-language assignment; supports `{variable}` interpolation from `kickoff(inputs=...)` |
| `expected_output` | Completion criteria the LLM is instructed to satisfy (also accepts a Pydantic class) |
| `agent` | The `Agent` responsible for this task (omit to let Crew auto-assign with hierarchical process) |
| `context` | List of other `Task` objects whose outputs are injected as context before execution |
| `tools` | Override the agent's default tool set for this task only |
| `async_execution` | `True` lets the crew continue to the next task without waiting |
| `output_pydantic` | Enforce a Pydantic model for the output; accessible via `task.output.pydantic` |
| `output_json` | Like `output_pydantic` but returns a dict; accessible via `task.output.json_dict` |
| `output_file` | Write raw output to a file path |
| `callback` | `Callable[[TaskOutput], None]` invoked after task completes |
| `human_input` | `True` pauses execution for a human to review/edit the draft output |
| `guardrail` | A callable that validates output; crew retries up to `guardrail_max_retries` on failure |

### TaskOutput attributes

After `crew.kickoff()`, inspect `task.output` (a `TaskOutput` instance):

- `.raw` — default string output (always present)
- `.pydantic` — typed model instance (only if `output_pydantic` was set)
- `.json_dict` — dict (only if `output_json` was set)
- `.description` — task description
- `.summary` — auto-generated one-line summary

### Gotchas

1. **`context` does not imply ordering.** Listing a task in `context` makes its output available as prompt context, but it does NOT change execution order in a `Process.sequential` crew — ordering is determined solely by the position in the `tasks` list. For async tasks, `context` does block until those tasks finish, which is the correct pattern for fan-out/join.

2. **`output_pydantic` and `output_json` are mutually exclusive on a single task.** Setting both causes the Pydantic model to take precedence and the JSON dict will be `None`. Also, the LLM must reliably emit parseable JSON — if the model drifts, the task will raise a validation error rather than silently returning garbage. Use `guardrail` or `guardrail_max_retries` to handle flaky LLM formatting instead of try/except at the call site.
