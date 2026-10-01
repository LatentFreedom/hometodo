# PRD - Home Todos

## What this is

Home Todos is a small, self-hosted tracker for the work of running a household.
It holds the tasks that do not belong in a code issue tracker: the contractor who
must quote the roof, the gutter that leaks in heavy rain, the car service that is
due, the form that must be filed, the person you promised to call back.

One person owns an installation. It is a single-admin app, not a team tool.

## Why it exists

Household work is tracked badly by the tools people already have.

- A notes app loses the structure. There is no due date, no cost, no status.
- A code issue tracker has no place for a phone number, a street address, or a
  quoted price, and pushing private household detail into a public tracker is a
  privacy problem, not an inconvenience.
- A reminders app forgets who you called and what they charged.

Home Todos keeps three things together that the other tools split apart: the area
of life a task belongs to, the task itself, and the person you call about it.

## Who it is for

The owner of one home, one car, and one pile of life admin, who is willing to run a
small app on their own infrastructure. A second audience is anyone who wants to fork
it: the whole point of the MIT licence and the ten-minute deploy path in `README.md`
is that a stranger can stand up their own copy with their own database.

## Model

Three records.

**Project** - an area of life that collects work. A project has a kind: `house`,
`car`, `family`, `admin`, `networking`, or `other`. Projects can be archived rather
than deleted, because the history of a finished renovation is worth keeping.

**Todo** - one unit of work inside a project. It has a status of `open`, `waiting`,
or `done`. `waiting` is deliberate and load-bearing: most household work is blocked
on somebody else, and a tracker that only has open and done cannot tell "I have not
started" from "I am waiting for a quote". A todo can carry a due date, an expected
or actual cost in cents, and a link to the contact responsible for it.

**Contact** - a person or business tied to the work. A roofer, a mechanic, a county
office, a neighbour. Name, role, phone, email, and free notes.

## Privacy

This repository is public. Every record above is private data and lives only in the
owner's own D1 database. Nothing in this repository - no fixture, no seed, no test -
carries a real name, address, phone number, or price.

## Stack

Next.js static export on Cloudflare Pages, a Cloudflare Worker for the API, and D1
for storage. Access is one admin key held as a Cloudflare secret: no accounts, no
login, and no signup path.

## Scope

In scope, in order:

1. Schema and the admin-key gate (this repository's first release).
2. A Worker API: CRUD over the three records, plus a read-only summary endpoint that
   another application can call with a bearer token.
3. A web interface: project cards, a per-project todo list, and a contacts page.
4. A one-time import from an existing reminders export.

Out of scope, and intended to stay out: multiple users, sharing, team permissions,
mobile applications, notifications, and calendar sync.

## Success

The owner stops keeping household work in a notes app, and a stranger can clone the
repository and reach a working deploy without asking a question.
