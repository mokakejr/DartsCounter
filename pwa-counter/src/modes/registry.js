// Mode id -> route de jeu / label affiché. Partagé entre PlaySetup (départ
// local et création de match à distance) et RemoteLobby (handover du sas vers
// le bon écran de jeu selon options.mode).

export const MODE_ROUTE = {
  shanghai: '/shanghai',
  cricket: '/cricket',
  superCricket: '/super-cricket',
  fiftyOne: '/51',
  bob27: '/bob27',
  roundTheClock: '/round-the-clock',
  killer: '/killer',
  halveIt: '/halve-it',
};

export const MODE_LABEL = {
  shanghai: 'Shanghai',
  cricket: 'Cricket',
  superCricket: 'Super Cricket',
  fiftyOne: '51',
  bob27: "Bob's 27",
  roundTheClock: 'Round the Clock',
  killer: 'Killer',
  halveIt: 'Halve It',
};
