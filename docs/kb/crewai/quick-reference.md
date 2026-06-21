# CrewAI Quick Reference

## Core Concepts

**Agents** are autonomous LLM personas with a role, goal, and backstory. They claim and execute tasks, using tools when needed.

**Tasks** are atomic units of work—define what an agent does, completion criteria, and downstream dependencies.

**Crews** orchestrate Agents and Tasks under a chosen Process, then run via `kickoff()`.

**Processes** define execution strategy: `sequential` (linear handoff) or `hierarchical` (manager-delegated).

**Tools** extend agent capability—file I/O, APIs, databases, search. Each has a name, description, and input schema.

**Flows** (event-driven) compose crews and LLM calls into typed, stateful pipelines using decorators (@start, @listen, @router).

---

## Hello Crew

```python
from crewai import Agent, Task, Crew, Process

# Create an agent
researcher = Agent(
    role="Researcher",
    goal="Find accurate information",
    backstory="Expert at gathering facts",
    tools=[web_search_tool]
)

# Create a task
task = Task(
    description="Research climate change impacts",
    agent=researcher,
    expected_output="A detailed summary of climate impacts"
)

# Create and run a crew
crew = Crew(
    agents=[researcher],
    tasks=[task],
    process=Process.sequential
)

result = crew.kickoff()
print(result)
```

---

## Core Classes

| Class | Purpose |
|-------|---------|
| `Agent` | LLM persona with role, goal, backstory, tools; claims tasks |
| `Task` | Atomic work unit; describes what, done criteria, input/output |
| `Crew` | Orchestrator binding agents, tasks, and process |
| `Process` | Enum: `sequential` or `hierarchical` execution strategy |
| `Tool` | Callable capability; name, description, input schema |
| `Flow` | Event-driven pipeline; @start, @listen, @router decorators |
| `CrewBase` | Base class for inheritance-based crew definitions |

---

## Key Methods

| Method | Use |
|--------|-----|
| `Agent.execute_task(task)` | Run a single task (internal) |
| `Crew.kickoff()` | Execute all tasks in the crew |
| `Crew.kickoff_async()` | Execute asynchronously |
| `Task.execute_sync()` | Run task synchronously (internal) |
| `@Flow.start` | Entry point for a flow |
| `@Flow.listen` | Listen for task completion; route next step |
| `@Flow.router` | Conditional branching in flows |

---

## Tool Anatomy

```python
from crewai.tools import tool

@tool
def fetch_data(query: str) -> str:
    """Fetch data from an API. Pass the query string."""
    # Your logic here
    return result

# Pass to agent: tools=[fetch_data]
```

**Key:** LLM reads the docstring to decide *when* to invoke.

---

## Process Comparison

| Process | Behavior |
|---------|----------|
| `sequential` | Task 1 → Task 2 → Task 3 (linear handoff) |
| `hierarchical` | Manager agent delegates to workers, aggregates results |

---

## Flow Decorators

| Decorator | Purpose |
|-----------|---------|
| `@start` | Marks entry point of a flow |
| `@listen` | Waits for upstream task/method; triggers on completion |
| `@router` | Conditional branching (returns method name or task list) |

---

## Minimal Flow Example

```python
from crewai.flow.flow import Flow, listen, start

class ResearchFlow(Flow):
    @start()
    def research_phase(self):
        return crew.kickoff(inputs={"topic": "AI trends"})
    
    @listen(research_phase)
    def write_phase(self, research_output):
        return f"Written based on: {research_output}"

flow = ResearchFlow()
flow.kickoff()
```