# Server-Authoritative Settlements

## Farm plots

Farm layout, IDs, crop type, position, growth duration and yield range are server definitions. Planting validates presence, distance and one canonical Shroom seed. Harvesting validates the server ready timestamp and awards server-selected yield and XP.

## Settlement animals

Animal IDs, positions, species, cooldown and production are server definitions. Collection validates presence, distance and server readiness, then writes reward and XP atomically.

## Current scope

This is per-account settlement production, not a shared wildlife population simulation. Combat hunting is disabled as an economic source until server wildlife instances are added.
