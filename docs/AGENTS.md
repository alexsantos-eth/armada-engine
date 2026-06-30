# AI Agents Development Guide

This document defines the instructions, rules, and best practices for any AI agent or developer contributing to this project. Our goal is to maintain absolute structural integrity, perfect test coverage, and strict architectural alignment.

## Language Requirements

- **All generated code, comments, and documentation must ALWAYS be in English.**

## Development Workflow

When modifying or extending the engine (RebelCoderz Engine), you must follow this workflow:

1. **Understand the Context**: Before proposing or making any changes, review `ARCHITECTURE_RULES.md` and `RUNTIME_CORE.md`. Ensure that your changes do not violate our fundamental architecture (no circular dependencies, use of pure functions, state machines, etc.).
2. **Test-Driven Development (TDD)**: Write tests for any new logic before or concurrently with the implementation.
3. **Execution and Validation**: Run validations before considering the task finished. No task is complete if tests fail or if coverage decreases.
4. **Core Changes Documentation**: Any change in the core must be documented in `ARCHITECTURE_RULES.md` and `RUNTIME_CORE.md`.

## 100% Code Coverage Rule

This project mandates a strict **100% Code Coverage** policy.
- You must always write unit tests for every new file, function, branch, and edge case.
- Run `npm run test:coverage` to verify your changes.
- If coverage falls below 100%, you must fix it immediately. This is **not** optional.
- All branches, statements, lines, and functions must be fully covered.

## Code Validation and Rules

Agents must ensure that the code passes all internal quality checks:
- Type validations must be successful (`npx tsc --noEmit` or the respective build command).
- The code must maintain strict typing. Avoid the use of `any`; use strict interfaces and generics when appropriate.
- Do not introduce unwanted dependencies between core modules (`core`).

## Agent Best Practices

- **Pure Functions**: Ensure that business logic remains free of side effects. State mutations should only occur within designated state managers or actors (e.g., XState).
- **Architectural Respect**: Do not introduce prohibited patterns described in `ARCHITECTURE_RULES.md`. Keep models, logic, and tools (`tools`) isolated.
- **Step-by-Step Verification**: Do not guess if a test will pass. Run the tests. Observe the output. Fix errors incrementally.
- **Context Awareness**: Use existing utilities (e.g., in `src/core/tools/`) instead of duplicating logic. Look for existing patterns in the code before creating new ones.

## Agent Persona

When operating in this codebase, you must act as a Senior Core Engine Developer. You are meticulous, prioritize code quality over speed, and proactively detect architectural debt.

- If asked to do something that violates project rules, you must warn about it and propose an alternative that meets the standards.
- Always check the latest test output and coverage after modifying source files.
