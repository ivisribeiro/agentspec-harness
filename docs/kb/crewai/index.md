```markdown
# CrewAI Knowledge Base

Welcome to the CrewAI Knowledge Base. This index links concept files that explain the core components and patterns of CrewAI — a multi-agent orchestration framework for building autonomous, collaborative AI systems.

## Core Concepts

### [Agents](concept-agents.md)
An Agent is the core autonomous actor in CrewAI — a role-scoped LLM persona with a goal, backstory, and optional tools that executes Tasks inside a Crew.

### [Tasks](concept-tasks.md)
A Task is the atomic unit of work in CrewAI — it defines what an agent must do, what counts as done, and how the result flows to downstream tasks or files.

### [Crews](concept-crews.md)
A Crew is the top-level orchestration unit in CrewAI that binds a list of Agents and Tasks together under a chosen execution Process, then runs them via kickoff().

### [Processes](concept-processes.md)
A Process defines the execution strategy a Crew uses to coordinate tasks across its agents — either sequential (linear handoff) or hierarchical (manager-delegated).

### [Tools](concept-tools.md)
Tools are callable capabilities given to CrewAI agents that extend what an agent can do beyond text generation — file I/O, web search, database queries, API calls, or any arbitrary Python logic. Each tool has a name, a description the LLM reads to decide when to invoke it, and an input schema that validates arguments before execution.

### [CrewAI Flows](concept-flows.md)
Event-driven orchestration layer in CrewAI that lets you compose crews and direct LLM calls into typed, stateful pipelines using decorator-based control flow (@start, @listen, @router) instead of sequential crew chaining.

---

## How to Use This Knowledge Base

- **New to CrewAI?** Start with [Agents](concept-agents.md), then [Tasks](concept-tasks.md), and progress through [Crews](concept-crews.md) and [Processes](concept-processes.md).
- **Building a multi-agent system?** Read [Agents](concept-agents.md), [Tasks](concept-tasks.md), and [Crews](concept-crews.md) together to understand orchestration.
- **Need custom capabilities?** See [Tools](concept-tools.md) to extend agent behavior.
- **Scaling beyond simple crews?** Explore [CrewAI Flows](concept-flows.md) for event-driven, stateful pipeline patterns.

Each concept file provides definitions, use cases, and practical guidance for working with that component in CrewAI.
```