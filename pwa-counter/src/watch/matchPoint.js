// Balle de match (Les Gradins) — détection pure, recalculée à chaque
// snapshot/delta (stateless : undo, reconnexion et arrivée en cours de
// match retombent toujours juste). Le serveur n'arbitre pas les règles
// (« office trust model ») : tout se déduit de scores + detail + round.
//
// Pas de mode x01 ici : la « balle de match » est réinterprétée par mode.
// Deux formes de tension :
//  - ciblée : { player, zone, label } — le joueur AU TIR peut conclure ;
//  - globale : { player: null, zone, label } — dernière manche (Shanghai,
//    Halve It), tout le monde retient son souffle.
import { HALVEIT_SEQUENCES } from '../modes/halveIt.js';
import { FIFTY_ONE_TARGET } from '../modes/fiftyOne.js';

// Au-delà de 10 cinqs restants, « peut finir ce tour » est théorique
// (max 36 cinqs/volée) : le bandeau serait permanent et ne dirait rien.
const FIFTY_ONE_TENSION_FIVES = 10;

export function computeMatchPoint(match, formatName = n => n) {
  if (!match || !match.started || match.finished) return null;
  const kind = match.detail?.kind;
  if (kind === 'cricket') return cricketMatchPoint(match, formatName);
  if (kind === 'killer') return killerMatchPoint(match, formatName);
  if (kind === 'shanghai' || match.mode === 'Shanghai') return shanghaiLastRound(match);
  if (match.mode === '51') return fiftyOneMatchPoint(match, formatName);
  if (match.mode === 'Halve It') return halveItLastRound(match);
  return null;
}

// Cricket / Super Cricket : une seule cible restant à fermer pour le joueur
// au tir, ET l'avance aux points (inversée en Cut Throat, où l'on encaisse).
function cricketMatchPoint(match, formatName) {
  const p = match.turn_player;
  const i = match.players?.indexOf(p) ?? -1;
  if (i < 0) return null;
  const { labels = [], marks = [] } = match.detail ?? {};
  const open = labels
    .map((_, t) => t)
    .filter(t => (marks[i]?.[t] ?? 0) < 3);
  if (open.length !== 1) return null;
  const mine = match.scores?.[p] ?? 0;
  const others = match.players.filter(x => x !== p).map(x => match.scores?.[x] ?? 0);
  if (!others.length) return null;
  const leads = match.variant === 'cutthroat'
    ? mine <= Math.min(...others)
    : mine >= Math.max(...others);
  if (!leads) return null;
  const labelText = labels[open[0]];
  const value = labelText === 'BULL' ? 25 : parseInt(labelText, 10);
  return {
    player: p,
    zone: Number.isFinite(value) ? value : null, // DBL/TRP/BED : pas une case
    label: `🔥 BALLE DE MATCH — ${formatName(p)} peut fermer ${labelText} !`,
  };
}

// 51 : proche de la cible exacte (bust au-delà) — la fin se joue au cordeau.
function fiftyOneMatchPoint(match, formatName) {
  const p = match.turn_player;
  if (!p || !match.players?.includes(p)) return null;
  const remaining = FIFTY_ONE_TARGET - (match.scores?.[p] ?? 0);
  if (remaining <= 0 || remaining > FIFTY_ONE_TENSION_FIVES) return null;
  return {
    player: p,
    zone: null,
    label: `🔥 BALLE DE MATCH — ${formatName(p)} à ${remaining * 5} points du 51 !`,
  };
}

// Shanghai : la dernière volée peut tout renverser (un Shanghai gagne sec).
function shanghaiLastRound(match) {
  const total = match.variant === 'bull' ? 21 : 7;
  const round = match.round ?? 1;
  if (round < total) return null;
  let zone = null;
  if (match.variant === 'bull') zone = 25;
  else if (match.variant === 'classic') zone = round <= 7 ? round : null;
  else zone = match.options?.targets?.[total - 1] ?? null; // remote only
  return { player: null, zone, label: '🔥 DERNIÈRE VOLÉE — tout peut basculer !' };
}

// Killer : duel final, le tireur est killer et sa victime n'a qu'une vie.
function killerMatchPoint(match, formatName) {
  const players = match.detail?.players ?? [];
  const alive = players.filter(pl => !pl.eliminated);
  if (alive.length !== 2) return null;
  const me = alive.find(pl => pl.name === match.turn_player);
  const victim = alive.find(pl => pl.name !== match.turn_player);
  if (!me?.isKiller || !victim || victim.lives !== 1) return null;
  return {
    player: me.name,
    zone: victim.number ?? null,
    label: `🔥 BALLE DE MATCH — ${formatName(me.name)} peut éliminer ${formatName(victim.name)} !`,
  };
}

// Halve It : dernière manche = BULL dans les deux séquences.
function halveItLastRound(match) {
  const seq = HALVEIT_SEQUENCES[match.variant === 'short' ? 'short' : 'standard'];
  if ((match.round ?? 1) < seq.length) return null;
  return { player: null, zone: 25, label: '🔥 DERNIÈRE MANCHE — tout peut basculer !' };
}
