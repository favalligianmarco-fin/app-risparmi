/**
 * Le nonne d'Italia: una per regione, ognuna col suo vestito e il suo modo di
 * mandare a quel paese gli automobilisti.
 *
 * Regole per le frasi (App Store, guideline 1.1.1, e buon gusto):
 * - parolacce leggere sì (classificazione 13+), bestemmie e insulti ai morti no;
 * - la nonna se la prende con chi guida male, mai con una regione o un gruppo;
 * - niente stereotipi offensivi (mafia, "terrone", "polentone"...).
 * I testi sono in dialetto "da nonna": vanno fatti rileggere a chi lo parla.
 */

export type Accessory =
  | 'glasses'
  | 'sunglasses'
  | 'headscarf'
  | 'straw-hat'
  | 'felt-hat'
  | 'alpine'
  | 'beret'
  | 'curlers'
  | 'pearls'
  | 'corno'
  | 'peperoncino'
  | 'apron'
  | 'shawl'
  | 'earrings'
  | 'flower'
  | 'fan';

export interface Look {
  dress: string;
  dots: string;
  cardigan: string;
  hair: string;
  shoes: string;
  bag: string;
  /** colore di foulard, cappello, grembiule o scialle */
  accent: string;
  accessories: Accessory[];
}

export interface Nonna {
  id: string;
  name: string;
  region: string;
  price: number;
  look: Look;
  /** Quando un'auto inchioda davanti a lei. */
  hit: string[];
  /** Quando alza la ciabatta. */
  slipper: string[];
  /** Quando qualcosa va bene (sosta riuscita, cuore ritrovato). */
  happy: string[];
}

const base = { hair: '#ecebf3', shoes: '#4a3b3b', bag: '#8a5a3c' };

export const NONNE: Nonna[] = [
  {
    id: 'campania',
    name: 'Nonna Nunzia',
    region: 'Campania',
    price: 0,
    look: { ...base, dress: '#1f5fa8', dots: '#7fb2ec', cardigan: '#fdfaf3', bag: '#e0443c', accent: '#f28bb6', accessories: ['curlers', 'corno', 'earrings', 'glasses'] },
    hit: ['Uè, scurnacchiato!', 'Si\' proprio \'nu cetrulo!', 'Tiene \'a capa sulo pe\' spartere \'e recchie!', 'Mannaggia a te!', 'Faccia \'e pesce!', 'Statte accuorto, guaglio\'!'],
    slipper: ['Mo\' te vatto cu \'a chianella!', 'Arriva \'a pantofola!', 'Fermateve tutte quante!'],
    happy: ['Bravo \'o guaglione!', 'Jamme, ja\'!', 'Chesta è \'a nonna!'],
  },
  {
    id: 'calabria',
    name: 'Nonna Concetta',
    region: 'Calabria',
    price: 0,
    look: { ...base, dress: '#26232f', dots: '#3a3950', cardigan: '#3a3950', bag: '#26232f', accent: '#e84a4a', accessories: ['peperoncino', 'earrings', 'glasses'] },
    hit: ['Scimunitu!', 'Mannaja \'a miseria!', 'Ma va\' zappa!', 'Cornutu e mazziatu!', 'Ti cadissi \'a lingua!', 'Lavativu!'],
    slipper: ['Mo\' ti minu cu \'a pantofula!', 'Ti mentu \'u peperoncinu!', 'Fermu tutti!'],
    happy: ['Bravu figghiu meu!', 'Chi bellu!', 'Mangia, ca si\' sciupatu!'],
  },
  {
    id: 'veneto',
    name: 'Nonna Bepina',
    region: 'Veneto',
    price: 0,
    look: { ...base, dress: '#a98bd8', dots: '#d9c9f2', cardigan: '#f29fb2', accent: '#5aa9f0', accessories: ['apron', 'glasses'] },
    hit: ['Mona!', 'Ciò, bauco!', 'Ostrega, che sempio!', 'Va in mona, va\'!', 'Tasi, ti, macaco!', 'Varda \'sto semenso!'],
    slipper: ['Varda che te tiro \'na papussa!', 'Ocio a la zavata!', 'Fermi tuti!'],
    happy: ['Bravo, tosatel!', 'Ben fato!', 'Xe na meraveja!'],
  },
  {
    id: 'lazio',
    name: 'Nonna Ines',
    region: 'Lazio',
    price: 30,
    look: { ...base, dress: '#f2c14e', dots: '#fbe38e', cardigan: '#8e3b46', accent: '#f28bb6', accessories: ['curlers', 'glasses'] },
    hit: ['Aò! Ma che stai a fa\'?!', 'A burino!', 'Ma che, sei de coccio?!', 'Te possino!', 'Aripijate, cocco!', 'Ma \'ndo vai, a cojone?!'],
    slipper: ['Mo\' te tiro \'na ciavatta!', 'Fermi tutti, che è mejo!', 'Arriva la ciavatta!'],
    happy: ['Daje!', 'Bravo cocco de nonna!', 'Sei \'n fenomeno!'],
  },
  {
    id: 'sicilia',
    name: 'Nonna Tana',
    region: 'Sicilia',
    price: 40,
    look: { ...base, dress: '#2a6fb0', dots: '#f7c948', cardigan: '#f7c948', bag: '#e8763f', accent: '#e8763f', accessories: ['earrings', 'fan', 'glasses'] },
    hit: ['Minchia!', 'Talìa chistu!', 'Babbasunazzu!', 'Mizzica, ma chi fai?!', 'Camurrìa!', 'Ma chi si\' orbu?!'],
    slipper: ['Ti dugnu \'na pantofulata!', 'Fermi tutti, minchia!', 'Arriva \'a pantofula!'],
    happy: ['Bravu, picciriddu!', 'Mizzica chi bravu!', 'Talìa chi beddu!'],
  },
  {
    id: 'lombardia',
    name: 'Nonna Carla',
    region: 'Lombardia',
    price: 50,
    look: { ...base, dress: '#2d3e5c', dots: '#3f5580', cardigan: '#d9c9a8', bag: '#a0522d', accent: '#d9c9a8', accessories: ['pearls', 'sunglasses'] },
    hit: ['Pirla!', 'Ma va a ciapà i ratt!', 'Barlafus!', 'Uè, bauscia!', 'Te set propi un balabiott!', 'Ma varda che roba!'],
    slipper: ['Adess te tiri la sciavatta!', 'Fermi tücc!', 'Ocio a la sciavatta!'],
    happy: ['Brao, bagaj!', 'Che bel lavorà!', 'Taac!'],
  },
  {
    id: 'toscana',
    name: 'Nonna Gina',
    region: 'Toscana',
    price: 60,
    look: { ...base, dress: '#8a5a3c', dots: '#b98b62', cardigan: '#e3c16f', accent: '#e3c16f', accessories: ['straw-hat', 'earrings', 'glasses'] },
    hit: ['Bischero!', 'O grullo!', 'Ma icché tu fai?!', 'Deh, ma tu se\' tonto?', 'Budello, che bischero!', 'Gnamo, grullo!'],
    slipper: ['Ora ti do la ciabatta nel groppone!', 'Fermi tutti, bischeri!', 'Icché tu guardi? La ciabatta!'],
    happy: ['Bravo citto!', 'Gnamo!', 'O che bellino!'],
  },
  {
    id: 'puglia',
    name: 'Nonna Cenzina',
    region: 'Puglia',
    price: 70,
    look: { ...base, dress: '#f5f0e6', dots: '#d9e6f2', cardigan: '#2a8fbd', accent: '#2a8fbd', accessories: ['headscarf', 'glasses'] },
    hit: ['Uè, stunàte!', 'Mannaggia la pupazza!', 'Sì \'nu mammalucche!', 'Ma ce sì, cecàte?!', 'Stu fetènde!', 'Ce sta\' a ffà?!'],
    slipper: ['Mo\' te tire \'a pandofle!', 'Fermatve tutte!', 'Arrive \'a pandofle!'],
    happy: ['Brave uagliò!', 'Ce bell!', 'Jè la nonne toje!'],
  },
  {
    id: 'emilia-romagna',
    name: 'Nonna Iolanda',
    region: 'Emilia-Romagna',
    price: 80,
    look: { ...base, dress: '#e8763f', dots: '#f5a47a', cardigan: '#f5efe0', accent: '#f5efe0', accessories: ['apron', 'glasses'] },
    hit: ['Pataca!', 'Soccia, che roba!', 'Burdèl, ma sei matto?', 'Sta\' mo\' attento, patacca!', 'Umarell del volante!', 'Ma va\' a cagare, va\'!'],
    slipper: ['Ocio che arriva la ciavàta!', 'Fermi tutti, burdèl!', 'Adès at dag la ciavàta!'],
    happy: ['Brèv burdèl!', 'Soccia che bravo!', 'Te sei un tesoro!'],
  },
  {
    id: 'liguria',
    name: 'Nonna Rina',
    region: 'Liguria',
    price: 90,
    look: { ...base, dress: '#2a8fbd', dots: '#ffffff', cardigan: '#ffffff', accent: '#e84a4a', accessories: ['straw-hat', 'glasses'] },
    hit: ['Belìn!', 'Abelinòu!', 'Belandi, che imbelinato!', 'Ma ti t\'ê scemmo?', 'Ma vanni a ciapâ i ratti!', 'Belìn, che maniman!'],
    slipper: ['Belìn, arriva a ciavatta!', 'Fermi tutti, belìn!', 'Ocio a-a ciavatta!'],
    happy: ['Belìn, che bravo!', 'Ben, ben!', 'E l\'ho pagato poco, eh!'],
  },
  {
    id: 'sardegna',
    name: 'Nonna Bonaria',
    region: 'Sardegna',
    price: 100,
    look: { ...base, dress: '#26232f', dots: '#3a3950', cardigan: '#c0392b', accent: '#fdfaf3', accessories: ['headscarf', 'apron', 'glasses'] },
    hit: ['Ajò, move·ti!', 'Tontu!', 'Mischinu, ma ite fais?!', 'Maccu!', 'Ma bai, bai!', 'Cosa \'e macchine!'],
    slipper: ['Ajò, arriva sa ciabatta!', 'Firmos totus!', 'Como ti dao sa ciabatta!'],
    happy: ['Ajò, bravu!', 'Eja, eja!', 'Bellu meu!'],
  },
  {
    id: 'piemonte',
    name: 'Nonna Piera',
    region: 'Piemonte',
    price: 110,
    look: { ...base, dress: '#7b2d3b', dots: '#a4495a', cardigan: '#8d8a99', accent: '#4a3b3b', accessories: ['felt-hat', 'pearls', 'glasses'] },
    hit: ['Ciula!', 'Tabalòri!', 'Bogia nen, fauss!', 'Fa nen \'l badola!', 'Ma guarda \'sto salam!', 'Bôja fauss, che manera!'],
    slipper: ['At dagh \'na savatà!', 'Fermi tuti!', 'Ocio a la savata!'],
    happy: ['Bravo, cit!', 'Che bel travaj!', 'A l\'è bin!'],
  },
  {
    id: 'trentino',
    name: 'Nonna Resi',
    region: 'Trentino-Alto Adige',
    price: 120,
    look: { ...base, dress: '#2f6b3a', dots: '#2f6b3a', cardigan: '#fdfaf3', accent: '#f28bb6', accessories: ['alpine', 'apron', 'glasses'] },
    hit: ['Ma va\' a remengo!', 'Na so was!', 'Bacàn!', 'Sakra, che tonto!', 'Porca l\'oca!', 'Ma varda \'sto zucon!'],
    slipper: ['Achtung, der Patschen!', 'Fermi tuti, subito!', 'Ocio a la zavata!'],
    happy: ['Brav, bòcia!', 'Sehr gut!', 'Ben fat!'],
  },
  {
    id: 'friuli',
    name: 'Nonna Gigia',
    region: 'Friuli-Venezia Giulia',
    price: 130,
    look: { ...base, dress: '#5a4a7a', dots: '#7e6ca3', cardigan: '#9aa1b0', accent: '#e8a33d', accessories: ['headscarf', 'glasses'] },
    hit: ['Mame mê, ce fâstu?!', 'Stupit!', 'Mona, ciò!', 'Ma va remengo!', 'Cjale ce ch\'al fâs!', 'Sempio!'],
    slipper: ['Ocio a la zavata!', 'Fermi ducj!', 'Cjape la zavate!'],
    happy: ['Brâf, frut!', 'Mandi, e grazie!', 'Benon!'],
  },
  {
    id: 'abruzzo',
    name: 'Nonna Filomena',
    region: 'Abruzzo',
    price: 140,
    look: { ...base, dress: '#3f8f4f', dots: '#6fb57b', cardigan: '#8a5a3c', accent: '#8a5a3c', accessories: ['shawl', 'glasses'] },
    hit: ['Si\' cchiù ciuccie de \'nu ciucce!', 'Mannaggia a te!', 'Ma va\' a zappà!', 'Ma che sci fa\'?!', 'Frechì, statte accorte!', 'Scimunite!'],
    slipper: ['Mo\' te le do \'na ciavatte!', 'Fermateve tutte!', 'Arriva la ciavatte!'],
    happy: ['Bbrave frechì!', 'Mamma mé, che bbrave!', 'Te\' na caramella!'],
  },
  {
    id: 'marche',
    name: 'Nonna Ada',
    region: 'Marche',
    price: 150,
    look: { ...base, dress: '#b8453a', dots: '#d9776c', cardigan: '#f4e9d8', accent: '#3d8bd9', accessories: ['beret', 'glasses'] },
    hit: ['Bardascio, ma che fai?', 'Ma che sei \'n baccalà?!', 'Scemo de guerra!', 'Ciò, ma vedi \'ndo vai!', 'Pistolone!', 'Ma va\' a pià l\'aria!'],
    slipper: ['Mo\' te do \'na ciavattata!', 'Fermi tutti, ciò!', 'Arriva la ciavatta!'],
    happy: ['Bravo bardascio!', 'Ciò, che bello!', 'Sei un amore!'],
  },
  {
    id: 'umbria',
    name: 'Nonna Assunta',
    region: 'Umbria',
    price: 160,
    look: { ...base, dress: '#6a8f3f', dots: '#8fb561', cardigan: '#d9cdb5', accent: '#9b7a5a', accessories: ['headscarf', 'glasses'] },
    hit: ['Sciammannato!', 'Ma che sei cionco?!', 'Ma guarda \'sto tonto!', 'Porca l\'oca!', 'Ma va\' a pià l\'aria!', 'Ma che fè?!'],
    slipper: ['Mo\' te do la ciavatta!', 'Fermi tutti!', 'Occhio a la ciavatta!'],
    happy: ['Bravo cittino!', 'Che bello, frate\'!', 'Tie\', \'na caramella!'],
  },
  {
    id: 'basilicata',
    name: 'Nonna Rocchina',
    region: 'Basilicata',
    price: 170,
    look: { ...base, dress: '#5b3f8c', dots: '#7c5bb3', cardigan: '#9b7a5a', accent: '#3a3950', accessories: ['headscarf', 'earrings', 'glasses'] },
    hit: ['Ma va\' a fatià!', 'Tamarro!', 'Si\' \'nu ciucce!', 'Uè, cecate!', 'Scimunito!', 'Ma che ffaje?!'],
    slipper: ['Mo\' te ménghe \'a ciabbatta!', 'Fermateve!', 'Arriva \'a ciabbatta!'],
    happy: ['Brave figlie mi!', 'Che bellezza!', 'Tie\', mangia!'],
  },
  {
    id: 'molise',
    name: 'Nonna Nicolina',
    region: 'Molise',
    price: 180,
    look: { ...base, dress: '#9f86e0', dots: '#c9b8f2', cardigan: '#f28bb6', accent: '#e84a4a', accessories: ['flower', 'glasses'] },
    hit: ['Il Molise esiste, e pure io!', 'Ma va\' a zappà!', 'Ciuccio!', 'Mannaggia \'a miseria!', 'Guarda \'sto fessacchiotto!', 'Ma chi t\'ha dat\' la patente?!'],
    slipper: ['Mo\' arriva \'a ciavatta molisana!', 'Fermi tutti, esisto!', 'Ciavatta!'],
    happy: ['Bravo, e il Molise esiste!', 'Che bravo figlio!', 'Esistiamo!'],
  },
  {
    id: 'valle-aosta',
    name: 'Nonna Joséphine',
    region: 'Valle d\'Aosta',
    price: 190,
    look: { ...base, dress: '#3b5f8a', dots: '#5c83b3', cardigan: '#c0392b', accent: '#c0392b', accessories: ['beret', 'glasses'] },
    hit: ['Crétin!', 'Mais regarde-moi ça!', 'Oh là là, quel imbécile!', 'Fa pa lo fou!', 'Espèce d\'andouille!', 'Ma guarda che tonto!'],
    slipper: ['Attention à la pantoufle!', 'Arrêtez-vous tous!', 'La pantoufle arrive!'],
    happy: ['Bravo, mon petit!', 'Magnifique!', 'Oh là là, que tu es fort!'],
  },
];

export function nonnaById(id: string): Nonna {
  return NONNE.find((n) => n.id === id) ?? NONNE[0];
}

export const FREE_NONNE = NONNE.filter((n) => n.price === 0).map((n) => n.id);
