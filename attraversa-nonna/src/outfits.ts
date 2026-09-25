/** Guardaroba della nonna: si sbloccano con le caramelle raccolte (nessun acquisto in denaro). */

export type Accessory = 'none' | 'straw-hat' | 'headband' | 'diva' | 'rock' | 'alpine' | 'tiara';

export interface Outfit {
  id: string;
  price: number;
  dress: string;
  dots: string;
  cardigan: string;
  hair: string;
  shoes: string;
  bag: string;
  accessory: Accessory;
}

export const OUTFITS: Outfit[] = [
  {
    id: 'classic',
    price: 0,
    dress: '#a98bd8',
    dots: '#d9c9f2',
    cardigan: '#f29fb2',
    hair: '#ecebf3',
    shoes: '#4a3b3b',
    bag: '#8a5a3c',
    accessory: 'none',
  },
  {
    id: 'sunday',
    price: 30,
    dress: '#4b6cb7',
    dots: '#ffffff',
    cardigan: '#f5efe0',
    hair: '#ecebf3',
    shoes: '#2d2a3e',
    bag: '#d94f5c',
    accessory: 'straw-hat',
  },
  {
    id: 'sporty',
    price: 60,
    dress: '#23a393',
    dots: '#23a393',
    cardigan: '#2cc2af',
    hair: '#ecebf3',
    shoes: '#ffffff',
    bag: '#f7c948',
    accessory: 'headband',
  },
  {
    id: 'diva',
    price: 100,
    dress: '#e0474c',
    dots: '#f07a7e',
    cardigan: '#e0474c',
    hair: '#f4e9d8',
    shoes: '#e0474c',
    bag: '#f7c948',
    accessory: 'diva',
  },
  {
    id: 'rock',
    price: 160,
    dress: '#5b3f8c',
    dots: '#7c5bb3',
    cardigan: '#34313f',
    hair: '#c38cf0',
    shoes: '#1f1d2b',
    bag: '#34313f',
    accessory: 'rock',
  },
  {
    id: 'alpine',
    price: 240,
    dress: '#9a6a44',
    dots: '#c69a6c',
    cardigan: '#3f8f4f',
    hair: '#ecebf3',
    shoes: '#5a3d2b',
    bag: '#c0392b',
    accessory: 'alpine',
  },
  {
    id: 'queen',
    price: 400,
    dress: '#f2c14e',
    dots: '#fff1b8',
    cardigan: '#8e5bd6',
    hair: '#ecebf3',
    shoes: '#8e5bd6',
    bag: '#f2c14e',
    accessory: 'tiara',
  },
];

export function outfitById(id: string): Outfit {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
}
