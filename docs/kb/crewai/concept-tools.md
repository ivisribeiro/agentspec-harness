## Tools

A **Tool** in CrewAI is a typed, named Python callable that an agent can invoke autonomously during task execution. The agent reads the tool's `name` and `description` to decide *when* to call it and what arguments to pass; the framework validates those arguments against a Pydantic schema before running the underlying logic.

### What it is / when to use it

Use a Tool whenever an agent needs to interact with the world outside the LLM — search the web, read a file, query a database, call an external API, or run business logic. Tools are assigned per-agent in the `tools=[...]` list on `Agent(...)`. Every tool call is automatically cached in-memory by `CacheHandler` (keyed on tool name + input string), so identical back-to-back calls within a session are free.

Two authoring styles exist:

| Style | Best for |
|---|---|
| `@tool` decorator | Simple, single-input tools; minimal boilerplate |
| `BaseTool` subclass | Structured multi-field input; reusable classes; type safety |

### Minimal code example

```python
from crewai import Agent, Task, Crew
from crewai.tools import tool, BaseTool
from pydantic import BaseModel, Field
from typing import Type

# --- Style 1: decorator (simplest) ---
@tool("Search knowledge base")
def search_kb(query: str) -> str:
    """Search the internal knowledge base for a given query string."""
    # replace with real lookup
    return f"Results for '{query}': ..."

# --- Style 2: BaseTool subclass (structured input) ---
class CalcInput(BaseModel):
    a: float = Field(..., description="First operand")
    b: float = Field(..., description="Second operand")

class AddTool(BaseTool):
    name: str = "Add numbers"
    description: str = "Returns the sum of two numbers."
    args_schema: Type[BaseModel] = CalcInput

    def _run(self, a: float, b: float) -> str:
        return str(a + b)

# --- Assign tools to an agent ---
analyst = Agent(
    role="Data Analyst",
    goal="Answer questions accurately",
    backstory="You are a precise analyst.",
    tools=[search_kb, AddTool()],
)

task = Task(
    description="What does the KB say about revenue?",
    expected_output="A short summary.",
    agent=analyst,
)

Crew(agents=[analyst], tasks=[task]).kickoff()
```

### Gotchas

1. **Description is the only signal the LLM has.** If the description is vague or overlaps with another tool's description, the agent will pick the wrong one (or call both). Write the description as a precise, single-sentence statement of *what* the tool does and *when* it is appropriate — not a general label.

2. **`result_as_answer=True` bypasses agent reasoning.** Passing `result_as_answer=True` when instantiating a tool (`MyTool(result_as_answer=True)`) forces the raw tool output to become the task result directly, skipping any further agent reflection. This is powerful for deterministic pipelines but will suppress the agent from refining or combining results with other context.
