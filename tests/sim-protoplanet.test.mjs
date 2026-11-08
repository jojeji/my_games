// Deploy-Sperre fuer Protoplanet Kapitel 1: der Bot (games/protoplanet/bot.js, gleiche Physik wie das Spiel) loest jedes feste Level,
// jede Levelfamilie ueber >= 40 Seeds zu >= 95 % und mit Median-Spielzeit zwischen 1 und 5 Minuten (Lehrlevels duerfen kuerzer sein).
// Kapitel 2 (Jaeger) steht in sim-protoplanet-jaeger.test.mjs (eigene Datei, damit die Tests parallel laufen).
import { simChapter } from './helpers/protoplanet-sim.mjs';

simChapter(1);
