/** French messages for the error codes returned by the engine and the server. */

import type { MoveError } from '@maitremot/engine';

export function moveErrorMessage(error: MoveError): string {
  switch (error.code) {
    case 'NO_TILES':
      return 'Pose au moins une lettre.';
    case 'OUT_OF_BOARD':
      return 'Une lettre est hors du plateau.';
    case 'SQUARE_OCCUPIED':
    case 'DUPLICATE_POSITION':
      return 'Cette case est déjà occupée.';
    case 'NOT_IN_LINE':
      return 'Les lettres doivent être sur une même ligne ou une même colonne.';
    case 'GAP_IN_WORD':
      return 'Le mot ne doit pas contenir de case vide.';
    case 'FIRST_MOVE_NOT_ON_CENTER':
      return "Le premier mot doit passer par l'étoile centrale.";
    case 'FIRST_MOVE_TOO_SHORT':
      return 'Le premier mot doit faire au moins 2 lettres.';
    case 'NOT_CONNECTED':
      return 'Le mot doit toucher une lettre déjà posée.';
    case 'INVALID_WORDS':
      return error.words.length === 1
        ? `${error.words[0]} n'est pas dans le dictionnaire.`
        : `Mots inconnus : ${error.words.join(', ')}.`;
    case 'NOT_ENOUGH_TILES_IN_BAG':
      return 'Il faut au moins 7 jetons dans le sac pour échanger.';
    case 'NOTHING_TO_EXCHANGE':
      return 'Choisis au moins une lettre à échanger.';
    case 'BLANK_LETTER_MISSING':
      return 'Choisis la lettre du joker.';
    case 'NOT_YOUR_TURN':
      return "Ce n'est pas ton tour.";
    case 'GAME_FINISHED':
      return 'La partie est terminée.';
    case 'TILE_NOT_IN_RACK':
    case 'LETTER_ON_NON_BLANK':
      return 'Coup impossible.';
  }
}

/** Errors of the online server, on top of the engine's move errors. */
export type ServerErrorCode =
  | 'CONFLICT'
  | 'WRONG_STATUS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NOT_FRIENDS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'SERVER_ERROR'
  | 'NETWORK'
  | 'CALLS_DISABLED';

export type AppError = MoveError | { readonly code: ServerErrorCode };

const SERVER_MESSAGES: Record<ServerErrorCode, string> = {
  CONFLICT: 'La partie vient de changer. Vérifie le plateau et rejoue.',
  WRONG_STATUS: "Cette action n'est plus possible pour cette partie.",
  FORBIDDEN: "Tu n'as pas le droit de faire ça dans cette partie.",
  NOT_FOUND: 'Partie introuvable.',
  NOT_FRIENDS: 'Tu ne peux inviter que tes amis.',
  NOT_ENOUGH_PLAYERS: 'Il faut au moins 2 joueurs pour lancer la partie.',
  BAD_REQUEST: 'Demande incorrecte.',
  UNAUTHORIZED: 'Ta session a expiré. Reconnecte-toi.',
  SERVER_ERROR: 'Le serveur a rencontré un problème. Réessaie.',
  NETWORK: 'Connexion au serveur impossible. Vérifie ta connexion à Internet.',
  CALLS_DISABLED: 'Les appels ne sont pas encore activés sur le serveur.',
};

/** Message for any error (engine or server). */
export function errorMessage(error: AppError): string {
  return error.code in SERVER_MESSAGES
    ? SERVER_MESSAGES[error.code as ServerErrorCode]
    : moveErrorMessage(error as MoveError);
}

/** "1 point" / "12 points". */
export const points = (n: number) => `${n} ${Math.abs(n) <= 1 ? 'point' : 'points'}`;
