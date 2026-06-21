## Agents

An **Agent** is the fundamental autonomous unit in CrewAI: a role-scoped LLM persona defined by a `role`, `goal`, and `backstory` that reasons, uses tools, and executes Tasks assigned to it within a Crew.

### What it is / when to use it

Use an Agent whenever you need a distinct area of responsibility inside a multi-agent pipeline. Each Agent:

- Maintains its own system prompt built from `role` + `goal` + `backstory`.
- Holds a private tool list; tools are only available to the agent they are assigned to.
- Can optionally delegate sub-tasks to other agents when `allow_delegation=True`.
- Tracks its own short-term memory within a run and, optionally, long-term memory across runs when `memory=True`.

Define one Agent per distinct role (researcher, writer, QA reviewer, etc.). Avoid cramming multiple responsibilities into one Agent — specificity makes the backstory more effective and keeps tool scope tight.

### Minimal correct example

```python
from crewai import Agent, Task, Crew
from crewai_tools import SerperDevTool

search_tool = SerperDevTool()

researcher = Agent(
    role="Market Research Analyst",
    goal="Find the three most important recent developments in {topic}",
    backstory=(
        "You are a seasoned analyst who surfaces concise, evidence-backed "
        "insights. You cite sources and never speculate."
    ),
    llm="gpt-4o-mini",        # string model name OR an LLM object
    tools=[search_tool],
    allow_delegation=False,    # single-agent crews: keep False to avoid loops
    verbose=True,
    max_iter=15,               # set explicitly — default has changed across versions
    memory=False,
)

task = Task(
    description="Research the latest trends in {topic}.",
    expected_output="A bullet-point briefing with three findings and source URLs.",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff(inputs={"topic": "AI regulation"})
print(result.raw)
```

### Gotchas

1. **`allow_delegation` defaults to `True`** in many CrewAI versions. In a single-agent crew this causes the agent to try to delegate to itself, burning tokens in a loop. Set `allow_delegation=False` on every agent that should not hand off work.

2. **`verbose` is a bool, not an int level.** Older tutorials pass an integer (e.g., `verbose=2`); current CrewAI expects `True`/`False`. Passing an int silently coerces or raises a validation error depending on the version — always use a bool and pin your CrewAI version in `pyproject.toml`.
