# Car Rental Platform | Booking & Operations System

A full-stack, bilingual car-rental platform that combines a customer-facing
booking experience with an operational back office for running the rental
business.

Built with Next.js and TypeScript, the system connects vehicle discovery,
availability, reservations, pricing, handovers, documents, reporting and
security workflows in one application.

> **Portfolio version:** This repository contains application source code and
> safe configuration templates only. It excludes real customer, reservation,
> financial and media data, along with production credentials and deployment
> configuration.

## What I Built

### Customer Experience

- Vehicle catalogue with segment, budget and availability filters
- Vehicle comparison and saved-vehicle functionality
- Booking flow with server-side price calculation, extras, locations and
  handover time rules
- Reservation lookup, confirmation and cancellation flow
- Polish and English localisation
- SEO landing pages, structured data, sitemap and dynamic Open Graph cards
- Cookie consent and privacy-aware analytics loading

### Rental Operations

- Fleet, vehicle, availability and pricing management
- Reservation lifecycle management, including handover and return protocols
- Mileage, damage, deposit, payment and cancellation handling
- Customer, document, finance and reporting workflows
- Lead inbox and chat-assistant management
- Role-based access, two-factor authentication, audit logging and security
  alerts

## Engineering Highlights

- Prices are calculated and verified on the server, rather than accepted from
  the browser.
- Monetary values are stored as integer grosze to avoid floating-point errors.
- The booking system snapshots pricing data onto each reservation.
- The application supports authenticated administration, TOTP two-factor
  authentication, security headers, rate limiting and audit trails.
- Optional services such as email, analytics, bot protection and the assistant
  degrade gracefully when not configured.

## Architecture

```text
Customer website                 Operations back office
Vehicle discovery and booking    Fleet, pricing and reservations
              \                 /
               Next.js application
                       ↓
      Domain services: booking, pricing, fleet, auth,
      documents, analytics, email, storage and security
                       ↓
             PostgreSQL via Drizzle ORM
```

## Technology

| Area | Technology |
| --- | --- |
| Framework | Next.js App Router, React Server Components, Server Actions |
| Language | TypeScript |
| UI | React, Tailwind CSS, Framer Motion, Lucide |
| Database | PostgreSQL, Drizzle ORM, SQL migrations |
| Authentication | Auth.js, Argon2 password hashing, TOTP two-factor authentication |
| Localisation | next-intl with Polish and English routes |
| Validation | Zod |
| Email | Resend |
| Security | Cloudflare Turnstile, rate limiting, honeypot and timing checks |
| Assistant | Cloudflare Workers AI with a rule-based fallback |
| Tooling | Docker, Docker Compose, ESLint, Prettier |

## Repository Structure

```text
src/app/          Public pages, admin pages and API routes
src/components/   Booking, fleet, admin, layout and UI components
src/lib/          Domain logic, database, auth, security and integrations
src/messages/     Polish and English translation catalogues
drizzle/          SQL migrations
scripts/          Development and administration scripts
public/           Public static assets (media intentionally excluded)
```

## Run Locally

### Requirements

- Node.js 22 or newer
- PostgreSQL 16, or Docker for the bundled local services

### Setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed
npm run admin:create -- admin@example.com "your-password" "Your Name"
npm run dev
```

The development server runs at [http://localhost:3000](http://localhost:3000).
The admin area is available at `/pl/admin` or `/en/admin`.

## Useful Commands

```bash
npm run lint
npm run typecheck
npm run format
npm run build
npm run db:generate
npm run db:studio
```

## Security

See [SECURITY.md](SECURITY.md) for the project’s security approach, including
server-side pricing, parameterised database queries, Content-Security-Policy,
Argon2 password hashing, TOTP, rate limiting and audit logging.
