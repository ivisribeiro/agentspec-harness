## CrewAI Flows

A **Flow** is an event-driven, stateful pipeline class in CrewAI where each method is a step, and decorators wire steps together by declaring what triggers them — another step completing, any-of several steps, or all-of several steps.

### What it is / when to use it

Use Flows when you need **explicit, branching control flow** that goes beyond "run these agents in order":

- Conditional routing based on LLM or rule output (`@router`)
- Fan-in: wait for multiple parallel branches before proceeding (`and_`)
- Fan-out: react to whichever of several events fires first (`or_`)
- Typed, persistent state shared across all steps (plain `dict` or a Pydantic model)
- Mixing crews with direct LLM calls or arbitrary Python logic in one pipeline

If a simple sequential `Crew` is enough, a Flow adds unnecessary ceremony.

### Minimal correct example

```python
from crewai.flow.flow import Flow, listen, router, start
from pydantic import BaseModel

class InvoiceState(BaseModel):
    amount: float = 0.0
    approved: bool = False

class InvoiceFlow(Flow[InvoiceState]):

    @start()
    def load_invoice(self):
        self.state.amount = 1500.0          # populate typed state
        return self.state.amount

    @router(load_invoice)                    # branches on the return value
    def approval_gate(self, amount):
        return "auto_approve" if amount < 1000 else "manual_review"

    @listen("auto_approve")
    def approve(self):
        self.state.approved = True
        return "approved"

    @listen("manual_review")
    def queue_for_review(self):
        return "queued"

flow = InvoiceFlow()
result = flow.kickoff()          # synchronous
# result == "queued"
# flow.state.approved == False
```

`flow.kickoff()` returns the output of the **last step that ran**. For async contexts use `await flow.kickoff_async()`.

### Gotchas

1. **`@router` must return a plain string that matches a `@listen("string")` exactly.** If no listener matches the returned string the flow silently stops with no error — add a catch-all `@listen(or_("...", "..."))` or validate router return values defensively.

2. **`and_` waits for all listed methods to complete before firing, but each method only fires once per `kickoff()` call.** If a branch is skipped by a router (i.e. it never runs), any `and_()` that includes it will never trigger — the flow hangs silently. Design `and_` listeners only around steps that are guaranteed to execute on every path, or guard with `or_`.
