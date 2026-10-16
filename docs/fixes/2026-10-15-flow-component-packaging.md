# Cloud flow packaging HTTP 400 0x80040216

Job c94995e7-e842-4629-9de0-23e7c68a110c failed before ImportJobId existed. Its approved manifest contains workflow type 29 and connection reference type 10163. Read-only inspection of its source temporary solution a949291c-8937-404e-8301-385997c2b298 returned zero solutioncomponents: failure occurred while adding the first workflow, before export/import.

The shared AddSolutionComponent builder incorrectly sent DoNotIncludeSubcomponents=true for all non-Table components. Microsoft documents this flag rejection for non-Entity roots, producing HTTP 400 0x80040216:
https://github.com/microsoft/power-platform-skills/blob/main/plugins/power-pages/skills/setup-solution/SKILL.md

The builder now includes DoNotIncludeSubcomponents=false only for a full Table and omits it for all other component types. AddRequiredComponents remains false, preserving the approved dependency scope. Off artifact preparation and deferred connection configuration remain enforced.

Validation: 79 tests passed, TypeScript and Vite build passed. Regression cases cover workflow 29, connection references 10163/10035, environment variable 380 and relationship 10; integration payload checks cover Column and Flow. No live AddSolutionComponent, export, import or retry was executed during this fix. The failed job is retained unchanged.
