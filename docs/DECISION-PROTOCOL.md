# NOVA — Decision Protocol

## Purpose

Prevent the agent from silently changing product scope or architecture.

---

## Decision Classes

### Class A — Local Implementation

The requirement is clear and existing architecture supports it.

Proceed.

Examples:
- bug fix;
- missing test;
- local component extraction;
- small UI correction;
- implementation of an already-defined rule.

### Class B — Architectural Decision

The requirement is clear but requires a meaningful architectural choice.

Before or during implementation:
- document the decision;
- create an ADR when durable;
- implement only after the decision is clear.

### Class C — Product Decision

The implementation would change:
- gameplay;
- MVP scope;
- progression;
- resource model;
- player interaction;
- major visual identity;
- simulation philosophy.

Stop and request a decision.

---

## Ambiguity

If two reasonable interpretations exist and they produce materially different behavior:

Do not guess.

Identify:
- interpretation A;
- interpretation B;
- impact;
- recommendation if useful.

Request a decision.

---

## Contradictions

When documents conflict:

1. identify the conflicting rules;
2. check authoritative documentation;
3. inspect implementation;
4. determine whether the contradiction is stale documentation or real product ambiguity.

Do not silently choose.

---

## Optimization

Do not optimize without evidence.

Required sequence:

    observe
      ↓
    measure
      ↓
    identify bottleneck
      ↓
    change
      ↓
    measure again

---

## New Systems

Before introducing a new system, answer:

1. What problem does it solve?
2. Why is the existing architecture insufficient?
3. Is it MVP?
4. What is its minimal form?
5. What does it depend on?
6. How will it be tested?
7. What is the removal cost?

If the answer indicates significant scope expansion, stop.

---

## Product Change Rule

A technical implementation must never silently become a design decision.

When implementation requires changing the intended player experience, request explicit approval.
