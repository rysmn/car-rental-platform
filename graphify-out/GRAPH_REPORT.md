# Graph Report - car-rental-platform  (2026-11-22)

## Corpus Check
- 527 files · ~759,574 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 4, .ttf 2, .example 1)

## Summary
- 3301 nodes · 11001 edges · 159 communities (129 shown, 30 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 98 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8a2f669a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- deterministic.ts
- db/schema.ts
- landing/index.ts
- settings.ts
- chat/data.ts
- next
- getDb
- insights.ts
- settings/actions.ts
- form-guard.ts
- nlu.ts
- reservations/actions.ts
- documents/actions.ts
- manage.ts
- getDb
- damages.ts
- economics.ts
- finanse/actions.ts
- email/notify.ts
- two-factor-actions.ts
- next-intl
- fleet/repo.ts
- finanse/page.tsx
- NewReservationForm.tsx
- analityka/page.tsx
- (public)/page.tsx
- rental-rules.ts
- db/index.ts
- guard.ts
- bezpieczenstwo/page.tsx
- ModelForm.tsx
- events.ts
- dashboard.ts
- pricing/actions.ts
- status.ts
- package.json
- critical.ts
- db
- Security posture
- DepositPanel.tsx
- chatbot-ai.ts
- dates.ts
- Bilingual
- MyReservations.tsx
- GoogleHomeBlock.tsx
- rate.ts
- dependencies
- legal/page.tsx
- BookingPanel.tsx
- users/actions.ts
- [carId]/page.tsx
- customers/[id]/page.tsx
- alerts/repo.ts
- driver-class.ts
- provider.ts
- guardPage
- UsersManager.tsx
- 0019_harsh_vargas.sql
- cloudflare.ts
- react
- (app)/inbox/actions.ts
- handover-actions.ts
- DeterministicProvider
- CookieConsent.tsx
- compilerOptions
- Link
- ChatWidget.tsx
- store.ts
- xlsx.ts
- zasady/actions.ts
- proxy.ts
- "public"."cars"
- "public"."reservations"
- (app)/chatbot/page.tsx
- pytania/page.tsx
- szkody/actions.ts
- useVoiceInput.ts
- landing/index.ts
- record.ts
- next-auth.d.ts
- faq.ts
- media.ts
- DeadlineManager.tsx
- zasady/page.tsx
- adminActionFailed
- "public"."admins"
- scripts
- invoice/[...path]/route.ts
- alerts/health.ts
- "reservations"
- "documents"
- ref_node_fs
- FormShield.tsx
- hours.ts
- cn
- 0041_wonderful_colleen_wing.sql
- LegalEditor.tsx
- audit/page.tsx
- booking/actions.ts
- DriverAgeForm.tsx
- rule-candidates.ts
- "audit_log"
- 0022_great_quasimodo.sql
- SettingsForms.tsx
- "damages"
- i18n-pick.ts
- eslint.config.mjs
- next-intl
- [slug]/page.tsx
- format.ts
- 0000_narrow_riptide.sql
- "customers"
- 0027_magenta_the_hood.sql
- drizzle-kit
- 0018_spotty_miss_america.sql
- 0020_lame_spirit.sql
- 0021_simple_spectrum.sql
- postcss.config.mjs
- public/README.md
- { GET, POST }
- analytics/page.tsx
- rentalDays
- fleet/ExpenseManager.tsx
- requirePermission
- booking/repo.ts
- getStorage
- normalize
- faq-live.ts
- .mileage
- BlockManager.tsx
- package.json
- chatbot/actions.ts
- lib/inbox/actions.ts
- ChatbotForm.tsx
- booking/schema.ts
- (app)/fleet/page.tsx

## God Nodes (most connected - your core abstractions)
1. `getDb()` - 340 edges
2. `next-intl` - 179 edges
3. `Link` - 135 edges
4. `recordAudit()` - 117 edges
5. `getSetting()` - 105 edges
6. `adminActionFailed()` - 97 edges
7. `next` - 94 edges
8. `requirePermission()` - 93 edges
9. `formatPln()` - 88 edges
10. `react` - 88 edges

## Surprising Connections (you probably didn't know these)
- `Implemented (Phase 3 — booking)` --references--> `computeQuote()`  [INFERRED]
  SECURITY.md → src/lib/booking/pricing.ts
- `Implemented (Phase 6 — admin management)` --references--> `canTransition()`  [INFERRED]
  SECURITY.md → src/lib/admin/reservation-status.ts
- `Implemented (Phase 6 — admin management)` --references--> `requireAdmin()`  [INFERRED]
  SECURITY.md → src/lib/auth/guard.ts
- `main()` --calls--> `hashPassword()`  [EXTRACTED]
  scripts/create-admin.ts → src/lib/auth/password-core.ts
- `handleSubmit()` --indirect_call--> `locale()`  [INFERRED]
  src/components/booking/BookingPanel.tsx → src/lib/chat/deterministic.ts

## Import Cycles
- None detected.

## Communities (159 total, 30 thin omitted)

### Community 0 - "deterministic.ts"
Cohesion: 0.09
Nodes (33): driverLimitsSentence(), driverClassFor(), getRentalRules(), getVocabulary(), ALL_CAPABILITIES, askSeats(), askWhatTheyWant(), availabilityNote() (+25 more)

### Community 1 - "db/schema.ts"
Cohesion: 0.02
Nodes (132): Admin, AdminRecoveryCode, adminRecoveryCodes, adminRole, admins, aiUsageDaily, AiUsageRow, alertSeverity (+124 more)

### Community 2 - "landing/index.ts"
Cohesion: 0.06
Nodes (57): generateMetadata(), KEY, VanRentalWarsawPage(), BusinessCarRentalWarsawPage(), generateMetadata(), KEY, ChopinAirportPage(), generateMetadata() (+49 more)

### Community 3 - "settings.ts"
Cohesion: 0.05
Nodes (40): CHATBOT_DEFAULT, chatbotSchema, COMPANY_DEFAULT, companySchema, EMPTY_SET, EUR_RATE_DEFAULT, eurRateSchema, EurRateSettings (+32 more)

### Community 4 - "chat/data.ts"
Cohesion: 0.09
Nodes (31): GET(), publicExtras(), computeQuote(), DailyRateRange, dailyRateRangeGrosze(), DAYS_PER_MONTH, feeAmount(), isPriceOnRequest() (+23 more)

### Community 5 - "next"
Cohesion: 0.09
Nodes (49): next, AboutPage(), generateMetadata(), generateMetadata(), ContactPage(), FaqPage(), generateMetadata(), generateMetadata() (+41 more)

### Community 6 - "getDb"
Cohesion: 0.11
Nodes (40): addModelFeature(), BlockSchema, bool, CarSchema, createCar(), createExpense(), createModel(), createRecurring() (+32 more)

### Community 7 - "insights.ts"
Cohesion: 0.16
Nodes (26): Delta(), InsightSections(), OCCUPANCY_DOT, pct(), shortMonth(), Tile(), CarOccupancy, carScope() (+18 more)

### Community 8 - "settings/actions.ts"
Cohesion: 0.28
Nodes (22): deleteHeroImage(), genericError(), HERO_TEXT_FIELD_NAMES, heroSlot(), heroVariant(), revalidatePublic(), revalidateSettings(), saveHeroSet() (+14 more)

### Community 9 - "form-guard.ts"
Cohesion: 0.11
Nodes (20): loginAction(), LoginState, LoginForm(), AdminLoginPage(), POTRZEBNY_KOD, ZLY_KOD, clientIp(), HeaderReader (+12 more)

### Community 10 - "nlu.ts"
Cohesion: 0.05
Nodes (55): ABROAD_TOPIC, AIRPORT_WORDS, AWAITING_POLICY, BODY_WORDS, bodyTypeOf(), BUDGET_EN, BUDGET_HAVE_EN, BUDGET_HAVE_PL (+47 more)

### Community 11 - "reservations/actions.ts"
Cohesion: 0.07
Nodes (55): daneKlientaDoListu(), depositInput, DepositResult, godzinyDoOdbioruZapisu(), input, MoveResult, odometerInput, oznaczNieodebranie() (+47 more)

### Community 12 - "documents/actions.ts"
Cohesion: 0.11
Nodes (34): DokumentForm(), EdytujDokument(), dynamic, Page(), WersjaAkcje(), WierszWersji(), updateReservationStatus(), recordAudit() (+26 more)

### Community 14 - "manage.ts"
Cohesion: 0.13
Nodes (38): Ekran, kanalKontaktu(), ManageReservation(), anuluj(), otworz(), otworzAnulowanie(), sprawdzZmiane(), zatwierdz() (+30 more)

### Community 15 - "getDb"
Cohesion: 0.12
Nodes (34): bodySchema, dynamic, FAILED, hits, POST(), przypomnijSobieZalewanie(), rateLimited(), slotsSchema (+26 more)

### Community 16 - "damages.ts"
Cohesion: 0.08
Nodes (46): ContactForm(), FlagForm(), CustomerCardPage(), Figure(), showEmail(), formatDateTimeLocale(), formatIsoDate(), DamageForm() (+38 more)

### Community 17 - "economics.ts"
Cohesion: 0.13
Nodes (30): Bar(), CarReport(), Figure(), Footer(), Header(), monthLabel(), MonthsTable(), pct() (+22 more)

### Community 18 - "finanse/actions.ts"
Cohesion: 0.10
Nodes (31): bool, createBusinessExpense(), createBusinessRecurring(), dateOrNull, deleteBusinessExpense(), deleteBusinessRecurring(), ExpenseSchema, FIELD_KEYS (+23 more)

### Community 19 - "email/notify.ts"
Cohesion: 0.11
Nodes (43): confirmVerification(), BOOKING_NOTIFY_TO, getMailer(), MAIL_FROM, REMINDER_NOTIFY_TO, esc(), ExpiringDocument, htmlBody() (+35 more)

### Community 20 - "two-factor-actions.ts"
Cohesion: 0.12
Nodes (36): RFC-4226, RFC-6238, EnforceTwoFactorPage(), odnowKodyZapasowe(), potwierdz2FA(), stanKodow(), start2FA(), StartWynik (+28 more)

### Community 21 - "next-intl"
Cohesion: 0.13
Nodes (19): generateMetadata(), LocaleLayout(), montserrat, raleway, CURRENCY_KEY, LOCALE_HINT_INIT_SCRIPT, LocaleSuggestion(), PreferencjeHtml() (+11 more)

### Community 22 - "fleet/repo.ts"
Cohesion: 0.11
Nodes (18): BudgetKind, FilteredFleet, FleetBudget, FleetFilterParams, parseBudget(), commercialOf(), FleetQuery, FleetQueryPrices (+10 more)

### Community 23 - "finanse/page.tsx"
Cohesion: 0.07
Nodes (48): FormResult, AddExpense(), CategorySelect(), ExpenseFields(), ExpenseManager(), ExpenseRow(), Feedback(), todayValue() (+40 more)

### Community 24 - "NewReservationForm.tsx"
Cohesion: 0.17
Nodes (15): FlagResult, PhoneBookingResult, Availability, FoundCustomer, isoOffset(), LocationOption, ModelOption, NewReservationForm() (+7 more)

### Community 25 - "analityka/page.tsx"
Cohesion: 0.12
Nodes (36): Chip(), Filters(), RANGES, Bars(), ChatAnalyticsPage(), DemandTable(), Empty(), Step() (+28 more)

### Community 26 - "(public)/page.tsx"
Cohesion: 0.10
Nodes (38): HomePage(), CarRates(), Rate(), MobileFold(), Cena(), PricingTable(), Parallax(), activeHeroImage() (+30 more)

### Community 27 - "rental-rules.ts"
Cohesion: 0.09
Nodes (35): abroadSchema, ageRequirementSchema, classClause(), classDefault(), configured(), configuredLimits(), documentsSchema, documentsStatements() (+27 more)

### Community 28 - "db/index.ts"
Cohesion: 0.12
Nodes (17): postgres@^3.4.9, drizzle-orm, postgres, dynamic, AdminRow, ChatbotState, ChatbotStatus, ConversationSummary (+9 more)

### Community 29 - "guard.ts"
Cohesion: 0.13
Nodes (23): dynamic, GET(), authorised(), dynamic, POST(), tokenMatches(), dynamic, GET() (+15 more)

### Community 30 - "bezpieczenstwo/page.tsx"
Cohesion: 0.10
Nodes (27): CacheActionResult, BuildCacheCard(), BuildCacheView, DOT, SecurityPage(), Card, SettingsHubPage(), CACHE_ALERT_PERCENT (+19 more)

### Community 31 - "ModelForm.tsx"
Cohesion: 0.07
Nodes (43): advancePrep(), deleteModel(), DeleteModelButton(), EditModelPage(), Action, currencySymbol(), localized(), ModelForm() (+35 more)

### Community 32 - "events.ts"
Cohesion: 0.14
Nodes (17): policzWBazie(), posprzataj(), skrotTresci(), sprawdzSesjeCzatu(), Stan, stany, WynikSesji, alertGdyGesto() (+9 more)

### Community 33 - "dashboard.ts"
Cohesion: 0.13
Nodes (29): AdminDashboard(), dayColumnClass(), FLEET_DOT, OperationCell(), timeCell(), TodayActions(), AttentionItem, AttentionKind (+21 more)

### Community 34 - "pricing/actions.ts"
Cohesion: 0.27
Nodes (15): Empty(), PricingPage(), Section(), CancellationPolicyForm(), FEE_CODES, FeeRow(), Field(), LocationRow() (+7 more)

### Community 35 - "status.ts"
Cohesion: 0.12
Nodes (27): CompareColumn, CompareRow, CompareTable(), SavedList(), CarCard(), Spec(), FavoriteButton(), announceSavedChange() (+19 more)

### Community 36 - "package.json"
Cohesion: 0.11
Nodes (19): devDependencies, prettier@^3.9.4, prettier-plugin-tailwindcss@^0.8.0, tailwindcss@^4, tsx@^4.23.0, @types/node@^20, @types/pg@^8.20.0, @types/react@^19 (+11 more)

### Community 37 - "critical.ts"
Cohesion: 0.09
Nodes (33): odblokujKrytyczne(), StanOkna, stanOknaKrytycznego(), zablokujKrytyczne(), AdminLayout(), doSignOut(), ICON, metadata (+25 more)

### Community 38 - "db"
Cohesion: 0.12
Nodes (16): environment, healthcheck, image, ports, volumes, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+8 more)

### Community 39 - "Security posture"
Cohesion: 0.08
Nodes (23): Architecture, Car Rental Platform | Booking & Operations System, Customer Experience, Engineering Highlights, Rental Operations, Repository Structure, Requirements, Run Locally (+15 more)

### Community 40 - "DepositPanel.tsx"
Cohesion: 0.16
Nodes (20): asStatus(), DepositsPage(), Td(), Th(), DepositPanel(), DEPOSIT_STATUS_HINT, DEPOSIT_STATUS_LABEL, DEPOSIT_STATUS_TONE (+12 more)

### Community 41 - "chatbot-ai.ts"
Cohesion: 0.19
Nodes (14): AiStatus, getChatbotAiPanel(), usingDb(), DAILY_NEURON_CAP, ESTIMATED_NEURONS_PER_CALL, nextResetUtc(), Reservation, TODAY (+6 more)

### Community 42 - "dates.ts"
Cohesion: 0.19
Nodes (23): shortcutRange(), DateRangePicker(), disabledFor(), pick(), Locale, t(), BOOKING_RULES, PickedDates (+15 more)

### Community 43 - "Bilingual"
Cohesion: 0.14
Nodes (25): InboxItem(), InboxView, InboxPage(), BY_PRIORITY, CURIOSITY_ONLY, REASON_LABEL, leadReason, LeadReason (+17 more)

### Community 44 - "MyReservations.tsx"
Cohesion: 0.17
Nodes (23): formatRange(), MyReservations(), MyReservationsLabels, RememberReference(), AKTYWNE_STATUSY, AktywneRezerwacje, useActiveReservations(), lookupReservations() (+15 more)

### Community 45 - "GoogleHomeBlock.tsx"
Cohesion: 0.19
Nodes (21): TrustStrip(), ReviewsLink(), GoogleHomeBlock(), GoogleReviewBar(), Stars(), ArrowRightIcon(), base(), cls() (+13 more)

### Community 46 - "rate.ts"
Cohesion: 0.14
Nodes (23): EurRateContext, DisplayCurrency, eurCentsToGrosze(), EurRate, formatEur(), formatEurDokladnie(), formatEurRange(), formatGroszeAsEur() (+15 more)

### Community 47 - "dependencies"
Cohesion: 0.09
Nodes (22): dependencies, @aws-sdk/s3-request-presigner@^3.1175.0, drizzle-orm@^0.45.2, framer-motion@^12.42.2, lucide-react@^1.33.0, next@16.2.10, next-intl@^4.13.1, @node-rs/argon2@^2.0.2 (+14 more)

### Community 48 - "legal/page.tsx"
Cohesion: 0.15
Nodes (22): Doc, DOC_PATHS, LegalSettingsPage(), Loc, LOCALES, Tab(), generateMetadata(), PrivacyPage() (+14 more)

### Community 49 - "BookingPanel.tsx"
Cohesion: 0.35
Nodes (9): AvailabilityCalendar(), getWybranyTermin(), getWybranyTerminNaSerwerze(), listeners, PUSTY, subscribeWybranyTermin(), ustawWybranyTermin(), WybranyTermin (+1 more)

### Community 50 - "users/actions.ts"
Cohesion: 0.15
Nodes (26): main(), Feedback(), PasswordForm(), ProfileForm(), AccountPage(), ActionResult, changeOwnPassword(), changeOwnSchema() (+18 more)

### Community 51 - "[carId]/page.tsx"
Cohesion: 0.25
Nodes (21): CarAnalyticsPage(), monthLabel(), Payback(), Stat(), WINDOWS, C, CostBreakdown(), DailyFlow() (+13 more)

### Community 52 - "customers/[id]/page.tsx"
Cohesion: 0.17
Nodes (18): asStatus(), PageLink(), ReservationsPage(), STATUSES, Td(), Th(), StatusBadge(), STYLES (+10 more)

### Community 53 - "alerts/repo.ts"
Cohesion: 0.15
Nodes (15): Op(), SEVERITY_STYLE, SystemAlerts(), AlertRow, asModule(), asSeverity(), toRow(), ALERT_MODULES (+7 more)

### Community 54 - "driver-class.ts"
Cohesion: 0.19
Nodes (10): SaveResult, DriverClassForm(), Feedback(), DriverClassRow, FLEET, FleetModelSeed, FleetUnitSeed, DRIVER_CLASS_LABEL (+2 more)

### Community 55 - "provider.ts"
Cohesion: 0.16
Nodes (19): release(), reserve(), settle(), AiFailure, CloudflareConfig, neuronsFor(), HybridOptions, HybridOutcome (+11 more)

### Community 56 - "guardPage"
Cohesion: 0.07
Nodes (41): AlertsPage(), CustomerForm(), CustomersPage(), HandoverResult, HandoverForm(), Block(), Line(), metadata (+33 more)

### Community 57 - "UsersManager.tsx"
Cohesion: 0.23
Nodes (17): MIN_PASSWORD_LENGTH, UiAdmin, Section(), UsersPage(), AdminList(), AdminRowItem(), CreateAdminForm(), DeleteConfirm() (+9 more)

### Community 58 - "0019_harsh_vargas.sql"
Cohesion: 0.16
Nodes (14): "chat_conversations", chat_conversations_started_idx, chat_conversations_status_idx, "chat_leads", chat_leads_created_idx, chat_leads_status_idx, "chat_messages", chat_messages_conversation_idx (+6 more)

### Community 59 - "cloudflare.ts"
Cohesion: 0.13
Nodes (16): AiResult, AiUsage, FIELD_CONTRACT, NEURONS_PER_MTOK, parseLoosely(), PRODUCTION_TIMEOUT_MS, readMessage(), SMALL_MODEL (+8 more)

### Community 60 - "react"
Cohesion: 0.15
Nodes (24): react, CarGallery(), CarMedia(), CarPhoto(), CarPhotos(), PhotoLightbox(), getThemeServerSnapshot(), getThemeSnapshot() (+16 more)

### Community 61 - "(app)/inbox/actions.ts"
Cohesion: 0.32
Nodes (7): closeSchema, loadTranscript(), markRequestRead(), ReadResult, TranscriptLine, markRead(), transcriptForLead()

### Community 62 - "handover-actions.ts"
Cohesion: 0.28
Nodes (11): zod, deleteHandover(), handoverInput, saveHandover(), getHandover(), syncOdometer(), deleteSignature(), resolveSignaturePath() (+3 more)

### Community 63 - "DeterministicProvider"
Cohesion: 0.33
Nodes (9): getContact(), DeterministicProvider, money(), t(), text(), Intent, Locale, ChatReply (+1 more)

### Community 65 - "CookieConsent.tsx"
Cohesion: 0.11
Nodes (26): dynamic, PublicLayout(), GoogleAnalytics(), Choice, ConsentLabels, COOKIE_INIT_SCRIPT, COOKIE_OPEN_EVENT, CookieConsent() (+18 more)

### Community 66 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 67 - "Link"
Cohesion: 0.15
Nodes (24): BrakUprawnienPage(), AdminNavLinks(), isActiveHref(), navColor(), NavItem, MobileNav(), MyReservationBadge(), MyReservationsNavLink() (+16 more)

### Community 68 - "ChatWidget.tsx"
Cohesion: 0.22
Nodes (17): ALL_ON, Block(), ChatCan, ChatWidget(), DatesBlock(), greetingFor(), LeadForm(), Locale (+9 more)

### Community 69 - "store.ts"
Cohesion: 0.35
Nodes (11): EMPTY, isSaved(), listeners, parse(), pruneSaved(), readSaved(), removeSaved(), subscribe() (+3 more)

### Community 70 - "xlsx.ts"
Cohesion: 0.12
Nodes (25): RFC-5987, dynamic, GET(), monthLabel(), monthsSheet(), stamp(), xlsxResponse(), totalsOf() (+17 more)

### Community 71 - "zasady/actions.ts"
Cohesion: 0.36
Nodes (12): checked(), genericError(), revalidateEverywhere(), saveDocumentRules(), saveDriverAgeRules(), saveDriverClasses(), stamp(), years() (+4 more)

### Community 72 - "proxy.ts"
Cohesion: 0.19
Nodes (15): clientIpOfRequest(), DOZWOLONE_ROBOTY, NARZEDZIA, OcenaAgenta, ocenAgenta(), PROGI_SCRAPINGU, attempts, config (+7 more)

### Community 73 - ""public"."cars""
Cohesion: 0.17
Nodes (10): "car_expenses", car_expenses_car_id_incurred_idx, car_expenses_incurred_idx, car_expenses_recurring_period_unique, "recurring_costs", recurring_costs_car_id_idx, "reminder_log", reminder_log_unique (+2 more)

### Community 74 - ""public"."reservations""
Cohesion: 0.17
Nodes (10): "reservation_payments", reservation_payments_reservation_idx, "reservation_deposit_events", reservation_deposit_events_reservation_idx, "handover_items", handover_items_one_per_code, "reservation_handovers", reservation_handovers_one_per_kind (+2 more)

### Community 75 - "(app)/chatbot/page.tsx"
Cohesion: 0.16
Nodes (17): ChatbotTabs(), TABS, LeadRow(), LeadView, LeadsPage(), ChatbotDashboard(), Tile(), ConversationsPage() (+9 more)

### Community 76 - "pytania/page.tsx"
Cohesion: 0.19
Nodes (12): AddToFaq(), UnansweredPage(), FaqDraft, listFaqDrafts(), listQuestions(), QuestionRow, looksSensitive(), MARK (+4 more)

### Community 77 - "szkody/actions.ts"
Cohesion: 0.18
Nodes (18): addDamagePhoto(), createDamage(), customerOfReservation(), damageInput, DamageResult, deleteDamagePhoto(), money, parse() (+10 more)

### Community 78 - "useVoiceInput.ts"
Cohesion: 0.15
Nodes (12): BCP47, Locale, MESSAGES, Recognition, RecognitionCtor, recognitionCtor(), RecognitionErrorEvent, RecognitionResultEvent (+4 more)

### Community 79 - "landing/index.ts"
Cohesion: 0.08
Nodes (39): CarRentalGdanskPage(), generateMetadata(), KEY, clamp(), dynamic, GET(), LANDING_KEYS, AIRPORT (+31 more)

### Community 80 - "record.ts"
Cohesion: 0.22
Nodes (12): onRequestError(), fingerprintOf(), AlertInput, recordAlert(), isSecretKey(), PATTERNS, REDACTED, redactText() (+4 more)

### Community 81 - "next-auth.d.ts"
Cohesion: 0.31
Nodes (8): next-auth@^5.0.0-beta.31, next-auth, AdminRole, JWT, next-auth, next-auth/jwt, Session, User

### Community 82 - "faq.ts"
Cohesion: 0.20
Nodes (15): ALIASES, buildIdf(), FaqEntry, FaqMatch, matchFaq(), MIN_COVERAGE, MIN_SCORE, restates() (+7 more)

### Community 83 - "media.ts"
Cohesion: 0.14
Nodes (12): sharp@^0.35.3, sharp, BRAND, loadPhoto(), OG_HEIGHT, OG_WIDTH, OgCard, resolveImageFile() (+4 more)

### Community 84 - "DeadlineManager.tsx"
Cohesion: 0.22
Nodes (12): addDeadline(), completeDeadline(), DeadlineResult, currencySymbol(), DeadlineManager(), formatDate(), DEADLINE_ACTION, DEADLINE_KINDS (+4 more)

### Community 85 - "zasady/page.tsx"
Cohesion: 0.19
Nodes (16): DocumentRulesForm(), Feedback(), RuleToggle(), Placeholder(), RentalRulesPage(), Section(), StatusChip(), Strong() (+8 more)

### Community 86 - "adminActionFailed"
Cohesion: 0.14
Nodes (28): GENERIC_ERROR, updatePublicStatus(), alertOperation(), failed(), markAlertOpen(), markAlertRead(), markAlertResolved(), Result (+20 more)

### Community 87 - ""public"."admins""
Cohesion: 0.24
Nodes (9): "availability_blocks", availability_blocks_car_id_idx, availability_blocks_dates_idx, "site_settings", "business_expenses", business_expenses_category_idx, business_expenses_incurred_idx, business_expenses_recurring_period_unique (+1 more)

### Community 88 - "scripts"
Cohesion: 0.15
Nodes (13): scripts, admin:create, build, db:generate, db:migrate, db:push, db:seed, db:studio (+5 more)

### Community 89 - "invoice/[...path]/route.ts"
Cohesion: 0.60
Nodes (4): dynamic, GET(), mimeForInvoice(), resolveInvoicePath()

### Community 90 - "alerts/health.ts"
Cohesion: 0.40
Nodes (12): checkBooking(), checkChat(), checkDatabase(), checkFleet(), checkFleetIntegrity(), checkMedia(), CheckResult, mediaDir() (+4 more)

### Community 91 - ""reservations""
Cohesion: 0.24
Nodes (9): "fees", "reservations", reservations_car_id_idx, reservations_car_model_id_idx, reservations_status_idx, "admins", reservation_cancellation_fees, reservation_cancellation_fees_due_idx (+1 more)

### Community 92 - ""documents""
Cohesion: 0.26
Nodes (9): "documents", documents_jedna_aktywna, documents_kategoria_idx, documents_wersja_unique, "reservation_documents", reservation_documents_rezerwacja_idx, reservation_documents_unique, documents_autosend_idx (+1 more)

### Community 93 - "ref_node_fs"
Cohesion: 0.23
Nodes (7): createLocalStorage(), ROOT, createS3Storage(), S3Konfiguracja, s3KonfiguracjaZEnv(), PutObjectInput, StorageDriver

### Community 94 - "FormShield.tsx"
Cohesion: 0.22
Nodes (17): BookingPanel(), handleSubmit(), Field(), Toggle(), BookingSummary(), PartnerForm(), RequestForm(), HoneypotField() (+9 more)

### Community 95 - "hours.ts"
Cohesion: 0.14
Nodes (18): ALL_DAY, daySchema, formatOpeningHours(), isAllDay(), isOpen(), OFFICE_DAY, OFFICE_HOURS_DEFAULT, OPENING_DAYS (+10 more)

### Community 96 - "cn"
Cohesion: 0.42
Nodes (6): CurrencyNote(), useEurRate(), CURRENCY_INIT_SCRIPT, CurrencySwitcher(), Button(), cn()

### Community 97 - "0041_wonderful_colleen_wing.sql"
Cohesion: 0.33
Nodes (9): admin_recovery_admin_idx, "admin_recovery_codes", "reservation_verifications", reservation_verifications_expires_idx, reservation_verifications_reservation_idx, "security_events", security_events_created_idx, security_events_kind_idx (+1 more)

### Community 98 - "LegalEditor.tsx"
Cohesion: 0.47
Nodes (5): Doc, LegalEditor(), Loc, Toolbar(), ToolbarButton()

### Community 99 - "audit/page.tsx"
Cohesion: 0.40
Nodes (8): AuditPage(), AuditRow(), JsonBlock(), AUDIT_CATEGORIES, AuditCategory, AuditEntry, isAuditCategory(), listAudit()

### Community 100 - "booking/actions.ts"
Cohesion: 0.13
Nodes (24): DriverLimits, createReservation(), ReserveResult, okresPytania(), checkDriverEligibility(), completedYears(), EligibilityIssue, parseIsoDate() (+16 more)

### Community 101 - "DriverAgeForm.tsx"
Cohesion: 0.39
Nodes (7): DriverAgeForm(), Feedback(), LockedRequirement(), Requirement(), Stamp(), FALLBACK_MIN_AGE, LICENCE_TENURE_ENFORCEABLE

### Community 102 - "rule-candidates.ts"
Cohesion: 0.25
Nodes (8): BUSINESS, CandidateKind, Classification, classifyQuestion(), hits(), OWN_BUTTONS, SECURITY, TEST_STRINGS

### Community 103 - ""audit_log""
Cohesion: 0.39
Nodes (6): "audit_log", audit_log_admin_idx, audit_log_created_idx, aa_tylko_dopisywanie(), audit_log_append_only, security_events_append_only

### Community 104 - "0022_great_quasimodo.sql"
Cohesion: 0.43
Nodes (7): "chat_demand", chat_demand_created_idx, chat_demand_fleet_idx, chat_demand_normalized_idx, chat_demand_unique, "chat_faq", chat_faq_status_idx

### Community 105 - "SettingsForms.tsx"
Cohesion: 0.11
Nodes (28): SaveResult, GoogleSettingsPage(), CompanyInfoForm(), Field(), GoogleMapsForm(), GoogleToggle(), HERO_TEXT_FIELD_META, HeroImageForm() (+20 more)

### Community 106 - ""damages""
Cohesion: 0.43
Nodes (5): "damage_photos", damage_photos_damage_idx, "damages", damages_car_idx, damages_status_idx

### Community 107 - "i18n-pick.ts"
Cohesion: 0.15
Nodes (17): InsightFilters(), SUGGESTIONS, PaymentResult, Row, BookingAnalytics, getBookingAnalytics(), num(), rowsOf() (+9 more)

### Community 108 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.2.10, eslint, eslint-config-next

### Community 109 - "next-intl"
Cohesion: 0.23
Nodes (12): csp, gaConfigured, nextConfig, securityHeaders, withNextIntl, next-intl, filterHref(), FleetFilterTarget (+4 more)

### Community 110 - "[slug]/page.tsx"
Cohesion: 0.12
Nodes (26): CarDetailPage(), dynamic, FLEET_HREF(), generateMetadata(), validDate(), dynamic, sitemap(), MobileBookingBar() (+18 more)

### Community 111 - "format.ts"
Cohesion: 0.24
Nodes (12): DateRangeForm(), ComparePage(), one(), Money(), MoneyRange(), CompareCar, ComparePricing, compareRange() (+4 more)

### Community 112 - "0000_narrow_riptide.sql"
Cohesion: 0.50
Nodes (4): "car_models", "cars", cars_model_id_idx, "pickup_locations"

### Community 113 - ""customers""
Cohesion: 0.50
Nodes (3): "customers", customers_name_idx, customers_phone_idx

### Community 114 - "0027_magenta_the_hood.sql"
Cohesion: 0.83
Nodes (3): "system_alerts", system_alerts_module_idx, system_alerts_state_idx

### Community 145 - "analytics/page.tsx"
Cohesion: 0.15
Nodes (21): AnalyticsPage(), DocumentCell(), monthLabel(), RecoveryBar(), TRANSLATED_SEGMENTS, UtilisationBar(), DocumentAlerts(), formatPl() (+13 more)

### Community 146 - "rentalDays"
Cohesion: 0.25
Nodes (17): lowestDailyRateGrosze(), rentalChargeGrosze(), rentalDays(), budgetGap(), findAlternatives(), findCars(), findNearestToBudget(), getCar() (+9 more)

### Community 147 - "fleet/ExpenseManager.tsx"
Cohesion: 0.15
Nodes (19): AddExpense(), CategorySelect(), currencySymbol(), ExpenseFields(), ExpenseManager(), ExpenseRow(), Feedback(), formatDate() (+11 more)

### Community 148 - "requirePermission"
Cohesion: 0.16
Nodes (20): ContactResult, createCustomer(), customerInputSchema(), CustomerResult, flagInput, setCustomerFlag(), Tr, updateCustomerContact() (+12 more)

### Community 149 - "booking/repo.ts"
Cohesion: 0.24
Nodes (10): FEE_DEFAULTS, LOCATION_DEFAULTS, LocationOption, PublicExtra, BookingExtras, DepositVariant, Fee, FeeCatalog (+2 more)

### Community 150 - "getStorage"
Cohesion: 0.20
Nodes (14): DokumentWiersz, DOCUMENT_URL_PREFIX, DoWyslania, nazwaPliku(), oznaczBlad(), WynikWysylki, wyslijDokumentyRezerwacji(), deleteDocumentFile() (+6 more)

### Community 151 - "normalize"
Cohesion: 0.16
Nodes (17): BRANDS, Demand, DEMAND_SEGMENTS, DemandKind, detectDemand(), findBrand(), FUEL_LABEL, GEARBOX_WORDS (+9 more)

### Community 152 - "faq-live.ts"
Cohesion: 0.16
Nodes (20): generateMetadata(), generateMetadata(), getSetting(), getServiceHours(), OpeningHours, PhoneHours, Locale, serviceHours() (+12 more)

### Community 153 - ".mileage"
Cohesion: 0.23
Nodes (12): OdometerResult, OdometerForm(), DNI_W_MIESIACU, limitKmDlaNajmu(), limitKmNaDobe(), nadprzebiegKm(), oplataNadprzebiegGrosze(), PROGI_PRZEBIEGU (+4 more)

### Community 154 - "BlockManager.tsx"
Cohesion: 0.24
Nodes (13): createAvailabilityBlock(), deleteAvailabilityBlock(), FormResult, moveModelImage(), readImages(), removeModelImage(), uploadModelImages(), writeImages() (+5 more)

### Community 155 - "package.json"
Cohesion: 0.14
Nodes (13): @aws-sdk/client-s3@^3.1175.0, resend@^6.17.2, @tiptap/starter-kit@^3.28.0, @tailwindcss/postcss@^4, typescript@^5, name, private, version (+5 more)

### Community 156 - "chatbot/actions.ts"
Cohesion: 0.23
Nodes (11): createFaqDraft(), deleteFaqEntry(), faqDraftSchema, faqSaveSchema, LEAD_STATUSES, LeadResult, saveFaqEntry(), schemaLead (+3 more)

### Community 157 - "lib/inbox/actions.ts"
Cohesion: 0.23
Nodes (10): SavedLead, EMPTY_SLOTS, notifyNewRequest(), MAX, RequestResult, requestSchema, notifyInboxLead(), LeadFacts (+2 more)

### Community 158 - "ChatbotForm.tsx"
Cohesion: 0.25
Nodes (8): SaveResult, Can(), ChatbotForm(), Feedback(), ChatbotSettingsPage(), ChatbotAiPanel, CHATBOT_HARD_LIMITS, ChatbotSettings

### Community 159 - "booking/schema.ts"
Cohesion: 0.36
Nodes (7): handoverSlots(), BookingRequest, bookingRequestSchema, handoverTime, isoDate, todayUtc(), utcMidnight()

### Community 160 - "(app)/fleet/page.tsx"
Cohesion: 0.50
Nodes (4): FleetPage(), listFleet(), Category, CATEGORY_LABEL

## Knowledge Gaps
- **4 isolated node(s):** `{ GET, POST }`, `RFC-4226`, `RFC-6238`, `RFC-5987`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 878 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next-intl` connect `next-intl` to `.mileage`, `landing/index.ts`, `(public)/page.tsx`, `next`, `getDb`, `insights.ts`, `settings/actions.ts`, `form-guard.ts`, `reservations/actions.ts`, `documents/actions.ts`, `manage.ts`, `damages.ts`, `analytics/page.tsx`, `economics.ts`, `finanse/actions.ts`, `two-factor-actions.ts`, `requirePermission`, `fleet/ExpenseManager.tsx`, `finanse/page.tsx`, `NewReservationForm.tsx`, `analityka/page.tsx`, `BlockManager.tsx`, `package.json`, `chatbot/actions.ts`, `getStorage`, `db/index.ts`, `ModelForm.tsx`, `(app)/fleet/page.tsx`, `dashboard.ts`, `pricing/actions.ts`, `bezpieczenstwo/page.tsx`, `ChatbotForm.tsx`, `critical.ts`, `status.ts`, `DepositPanel.tsx`, `Bilingual`, `dependencies`, `legal/page.tsx`, `BookingPanel.tsx`, `users/actions.ts`, `[carId]/page.tsx`, `customers/[id]/page.tsx`, `alerts/repo.ts`, `driver-class.ts`, `guardPage`, `UsersManager.tsx`, `react`, `(app)/inbox/actions.ts`, `handover-actions.ts`, `CookieConsent.tsx`, `Link`, `zasady/actions.ts`, `proxy.ts`, `(app)/chatbot/page.tsx`, `pytania/page.tsx`, `szkody/actions.ts`, `landing/index.ts`, `DeadlineManager.tsx`, `zasady/page.tsx`, `adminActionFailed`, `FormShield.tsx`, `LegalEditor.tsx`, `audit/page.tsx`, `DriverAgeForm.tsx`, `SettingsForms.tsx`, `next-intl`, `i18n-pick.ts`, `[slug]/page.tsx`, `format.ts`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **What connects `{ GET, POST }`, `RFC-4226`, `RFC-6238` to the rest of the system?**
  _4 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `deterministic.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08637873754152824 - nodes in this community are weakly interconnected._
- **Why does `getDb()` connect `getDb` to `landing/index.ts`, `settings.ts`, `chat/data.ts`, `insights.ts`, `settings/actions.ts`, `reservations/actions.ts`, `documents/actions.ts`, `manage.ts`, `getDb`, `damages.ts`, `analytics/page.tsx`, `finanse/actions.ts`, `economics.ts`, `requirePermission`, `two-factor-actions.ts`, `fleet/ExpenseManager.tsx`, `finanse/page.tsx`, `faq-live.ts`, `analityka/page.tsx`, `BlockManager.tsx`, `booking/repo.ts`, `chatbot/actions.ts`, `db/index.ts`, `guard.ts`, `ModelForm.tsx`, `bezpieczenstwo/page.tsx`, `dashboard.ts`, `(app)/fleet/page.tsx`, `pricing/actions.ts`, `events.ts`, `critical.ts`, `lib/inbox/actions.ts`, `DepositPanel.tsx`, `chatbot-ai.ts`, `Bilingual`, `MyReservations.tsx`, `users/actions.ts`, `customers/[id]/page.tsx`, `alerts/repo.ts`, `guardPage`, `UsersManager.tsx`, `(app)/inbox/actions.ts`, `handover-actions.ts`, `zasady/actions.ts`, `(app)/chatbot/page.tsx`, `pytania/page.tsx`, `szkody/actions.ts`, `record.ts`, `DeadlineManager.tsx`, `adminActionFailed`, `alerts/health.ts`, `email/notify.ts`, `audit/page.tsx`, `booking/actions.ts`, `i18n-pick.ts`, `[slug]/page.tsx`, `getStorage`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Should `db/schema.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.015037593984962405 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `landing/index.ts`, `getDb`, `settings/actions.ts`, `form-guard.ts`, `reservations/actions.ts`, `documents/actions.ts`, `getDb`, `damages.ts`, `economics.ts`, `finanse/actions.ts`, `two-factor-actions.ts`, `requirePermission`, `next-intl`, `NewReservationForm.tsx`, `BlockManager.tsx`, `package.json`, `chatbot/actions.ts`, `db/index.ts`, `guard.ts`, `ModelForm.tsx`, `(public)/page.tsx`, `dashboard.ts`, `lib/inbox/actions.ts`, `critical.ts`, `dependencies`, `legal/page.tsx`, `users/actions.ts`, `[carId]/page.tsx`, `customers/[id]/page.tsx`, `guardPage`, `UsersManager.tsx`, `react`, `(app)/inbox/actions.ts`, `handover-actions.ts`, `CookieConsent.tsx`, `Link`, `ChatWidget.tsx`, `xlsx.ts`, `zasady/actions.ts`, `proxy.ts`, `szkody/actions.ts`, `landing/index.ts`, `record.ts`, `media.ts`, `adminActionFailed`, `invoice/[...path]/route.ts`, `booking/actions.ts`, `next-intl`, `[slug]/page.tsx`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Should `landing/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0624048706240487 - nodes in this community are weakly interconnected._