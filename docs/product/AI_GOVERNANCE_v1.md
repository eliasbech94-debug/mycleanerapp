# AI Architecture Governance (Constitution Addendum)

Binding on every AI agent working on MyCleaner. Complements `CONSTITUTION_v1.md`.

## Mandatory 10-question pre-implementation gate
Before writing code for any change, verify:

1. Does this reuse an existing platform engine?
2. Does this follow the Design System?
3. Is this configurable rather than hardcoded?
4. Is this multi-country compatible?
5. Is this localization-ready?
6. Is this secure by design?
7. Is this GDPR compliant?
8. Can this support future service categories?
9. Can this be reused elsewhere?
10. Does this introduce technical debt?

Any "No" → reconsider the design before coding.

## Mandatory architecture review (every major milestone)
- Review the Constitution.
- Review existing platform engines.
- Review reusable components.
- Avoid duplicate logic, UI, APIs, and configuration.
- Prefer extending an engine over creating a new one.

## Continuous architecture
Architecture is never done. Every milestone must improve, without breaking existing functionality:
Reusability · Maintainability · Scalability · Security · Performance · Accessibility · Personalization · AI readiness.
