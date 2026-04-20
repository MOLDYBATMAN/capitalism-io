// Board data: all 40 spaces, cards, and geometry helpers

const BOARD_SIZE = 700;
const CORNER_SIZE = 80;
const SIDE_SIZE = 60; // (BOARD_SIZE - 2*CORNER_SIZE) / 9

const COLOR_MAP = {
  brown:    '#9B5E3A',
  lightblue:'#ADD8E6',
  pink:     '#FF69B4',
  orange:   '#FFA500',
  red:      '#FF3333',
  yellow:   '#FFD700',
  green:    '#2ECC40',
  darkblue: '#4169E1',
};

const PLAYER_COLORS = ['#00FFCC', '#FF4488', '#FFD700', '#FF8800'];
const PLAYER_NAMES_DEFAULT = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
const PLAYER_SHAPES = ['circle', 'square', 'triangle', 'diamond'];

// Helper: hex color to rgba (global, used by renderer.js too)
function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// group: which color monopoly group; groups: [1,3]=brown, [6,8,9]=lightblue, etc.
const SPACES = [
  { id:0,  name:'START',                 type:'go' },
  { id:1,  name:'Salvador',              flag:'🇧🇷', type:'property', color:'brown',    price:60,  mortgage:30,  rent:[2,10,30,90,160,250],      houseCost:50,  group:0 },
  { id:2,  name:'Treasure',              flag:'💰', type:'community_chest' },
  { id:3,  name:'Rio de Janeiro',        flag:'🇧🇷', type:'property', color:'brown',    price:60,  mortgage:30,  rent:[4,20,60,180,320,450],     houseCost:50,  group:0 },
  { id:4,  name:'Income Tax',            type:'tax',      amount:200 },
  { id:5,  name:'CDG Airport',           flag:'✈️', type:'railroad', price:200, mortgage:100 },
  { id:6,  name:'Tel Aviv',              flag:'🇮🇱', type:'property', color:'lightblue',price:100, mortgage:50,  rent:[6,30,90,270,400,550],     houseCost:50,  group:1 },
  { id:7,  name:'Surprise',              flag:'❓', type:'chance' },
  { id:8,  name:'Haifa',                 flag:'🇮🇱', type:'property', color:'lightblue',price:100, mortgage:50,  rent:[6,30,90,270,400,550],     houseCost:50,  group:1 },
  { id:9,  name:'Jerusalem',             flag:'🇮🇱', type:'property', color:'lightblue',price:120, mortgage:60,  rent:[8,40,100,300,450,600],    houseCost:50,  group:1 },
  { id:10, name:'In Prison',             type:'jail' },
  { id:11, name:'Milan',                 flag:'🇮🇹', type:'property', color:'pink',     price:140, mortgage:70,  rent:[10,50,150,450,625,750],   houseCost:100, group:2 },
  { id:12, name:'Electric Co.',          flag:'⚡', type:'utility',  price:150, mortgage:75 },
  { id:13, name:'Rome',                  flag:'🇮🇹', type:'property', color:'pink',     price:140, mortgage:70,  rent:[10,50,150,450,625,750],   houseCost:100, group:2 },
  { id:14, name:'Venice',                flag:'🇮🇹', type:'property', color:'pink',     price:160, mortgage:80,  rent:[12,60,180,500,700,900],   houseCost:100, group:2 },
  { id:15, name:'LHR Airport',           flag:'✈️', type:'railroad', price:200, mortgage:100 },
  { id:16, name:'Frankfurt',             flag:'🇩🇪', type:'property', color:'orange',   price:180, mortgage:90,  rent:[14,70,200,550,750,950],   houseCost:100, group:3 },
  { id:17, name:'Treasure',              flag:'💰', type:'community_chest' },
  { id:18, name:'Munich',                flag:'🇩🇪', type:'property', color:'orange',   price:180, mortgage:90,  rent:[14,70,200,550,750,950],   houseCost:100, group:3 },
  { id:19, name:'Berlin',                flag:'🇩🇪', type:'property', color:'orange',   price:200, mortgage:100, rent:[16,80,220,600,800,1000],  houseCost:100, group:3 },
  { id:20, name:'Vacation',              type:'free_parking' },
  { id:21, name:'Lyon',                  flag:'🇫🇷', type:'property', color:'red',      price:220, mortgage:110, rent:[18,90,250,700,875,1050],  houseCost:150, group:4 },
  { id:22, name:'Surprise',              flag:'❓', type:'chance' },
  { id:23, name:'Toulouse',              flag:'🇫🇷', type:'property', color:'red',      price:220, mortgage:110, rent:[18,90,250,700,875,1050],  houseCost:150, group:4 },
  { id:24, name:'Paris',                 flag:'🇫🇷', type:'property', color:'red',      price:240, mortgage:120, rent:[20,100,300,750,925,1100], houseCost:150, group:4 },
  { id:25, name:'JFK Airport',           flag:'✈️', type:'railroad', price:200, mortgage:100 },
  { id:26, name:'Shanghai',              flag:'🇨🇳', type:'property', color:'yellow',   price:260, mortgage:130, rent:[22,110,330,800,975,1150], houseCost:150, group:5 },
  { id:27, name:'Beijing',               flag:'🇨🇳', type:'property', color:'yellow',   price:260, mortgage:130, rent:[22,110,330,800,975,1150], houseCost:150, group:5 },
  { id:28, name:'Water Co.',             flag:'💧', type:'utility',  price:150, mortgage:75 },
  { id:29, name:'Shenzhen',              flag:'🇨🇳', type:'property', color:'yellow',   price:280, mortgage:140, rent:[24,120,360,850,1025,1200],houseCost:150, group:5 },
  { id:30, name:'Go to Prison',          type:'go_to_jail' },
  { id:31, name:'Manchester',            flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', type:'property', color:'green',    price:300, mortgage:150, rent:[26,130,390,900,1100,1275],houseCost:200, group:6 },
  { id:32, name:'Liverpool',             flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', type:'property', color:'green',    price:300, mortgage:150, rent:[26,130,390,900,1100,1275],houseCost:200, group:6 },
  { id:33, name:'Treasure',              flag:'💰', type:'community_chest' },
  { id:34, name:'London',                flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', type:'property', color:'green',    price:320, mortgage:160, rent:[28,150,450,1000,1200,1400],houseCost:200,group:6 },
  { id:35, name:'MUC Airport',           flag:'✈️', type:'railroad', price:200, mortgage:100 },
  { id:36, name:'Surprise',              flag:'❓', type:'chance' },
  { id:37, name:'San Francisco',         flag:'🇺🇸', type:'property', color:'darkblue', price:350, mortgage:175, rent:[35,175,500,1100,1300,1500],houseCost:200,group:7 },
  { id:38, name:'Luxury Tax',            type:'tax',      amount:100 },
  { id:39, name:'New York',              flag:'🇺🇸', type:'property', color:'darkblue', price:400, mortgage:200, rent:[50,200,600,1400,1700,2000],houseCost:200,group:7 },
];

// Number of properties in each color group
const GROUP_SIZES = { 0:2, 1:3, 2:3, 3:3, 4:3, 5:3, 6:3, 7:2 };

// Railroad IDs
const RAILROAD_IDS = [5, 15, 25, 35];
// Utility IDs
const UTILITY_IDS = [12, 28];

const CHANCE_CARDS = [
  { text:'Advance to Go! Collect $200.', type:'move', target:0, passGo:false },
  { text:'Advance to Illinois Avenue. If you pass Go, collect $200.', type:'move', target:24, passGo:true },
  { text:'Advance to St. Charles Place. If you pass Go, collect $200.', type:'move', target:11, passGo:true },
  { text:'Advance token to nearest Railroad. Pay owner twice the rental.', type:'nearest_railroad', multiplier:2 },
  { text:'Advance token to nearest Railroad. Pay owner twice the rental.', type:'nearest_railroad', multiplier:2 },
  { text:'Advance token to nearest Utility. Pay owner 10x dice.', type:'nearest_utility' },
  { text:'Bank pays you a dividend of $50.', type:'collect', amount:50 },
  { text:'Get out of jail free. This card may be kept until needed.', type:'jail_free' },
  { text:'Go back 3 spaces.', type:'move_back', steps:3 },
  { text:'Go to Jail! Do not pass Go, do not collect $200.', type:'go_to_jail' },
  { text:'Make general repairs: pay $25 per house, $100 per hotel you own.', type:'repairs', perHouse:25, perHotel:100 },
  { text:'Pay poor tax of $15.', type:'pay', amount:15 },
  { text:'Take a trip to Reading Railroad. If you pass Go, collect $200.', type:'move', target:5, passGo:true },
  { text:'Take a walk on the Boardwalk — advance token to Boardwalk.', type:'move', target:39, passGo:false },
  { text:'You have been elected Chairman of the Board — pay $50 to each player.', type:'pay_each', amount:50 },
  { text:'Your building loan matures — collect $150.', type:'collect', amount:150 },
];

const COMMUNITY_CHEST_CARDS = [
  { text:'Advance to Go! Collect $200.', type:'move', target:0, passGo:false },
  { text:'Bank error in your favor — collect $200.', type:'collect', amount:200 },
  { text:"Doctor's fees — pay $50.", type:'pay', amount:50 },
  { text:'From sale of stock you get $50.', type:'collect', amount:50 },
  { text:'Get out of jail free. This card may be kept until needed.', type:'jail_free' },
  { text:'Go to Jail! Do not pass Go, do not collect $200.', type:'go_to_jail' },
  { text:'Grand opera night — collect $50 from every player.', type:'collect_each', amount:50 },
  { text:'Holiday fund matures — receive $100.', type:'collect', amount:100 },
  { text:'Income tax refund — collect $20.', type:'collect', amount:20 },
  { text:'It is your birthday — collect $10 from every player.', type:'collect_each', amount:10 },
  { text:'Life insurance matures — collect $100.', type:'collect', amount:100 },
  { text:'Pay hospital fees of $100.', type:'pay', amount:100 },
  { text:'Pay school fees of $150.', type:'pay', amount:150 },
  { text:'Receive $25 consultancy fee.', type:'collect', amount:25 },
  { text:'Street repairs — pay $40 per house, $115 per hotel you own.', type:'repairs', perHouse:40, perHotel:115 },
  { text:'You have won second prize in a beauty contest — collect $10.', type:'collect', amount:10 },
  { text:'You inherit $100.', type:'collect', amount:100 },
];

// Returns the bounding rect {x, y, w, h} of a space on the 700x700 canvas
function getSpaceRect(id) {
  const B = BOARD_SIZE, C = CORNER_SIZE, S = SIDE_SIZE;
  if (id === 0)  return { x: B-C, y: B-C, w: C, h: C }; // GO (bottom-right)
  if (id === 10) return { x: 0,   y: B-C, w: C, h: C }; // Jail (bottom-left)
  if (id === 20) return { x: 0,   y: 0,   w: C, h: C }; // Free Parking (top-left)
  if (id === 30) return { x: B-C, y: 0,   w: C, h: C }; // Go To Jail (top-right)
  if (id >= 1  && id <= 9)  return { x: B-C - id*S,       y: B-C, w: S, h: C }; // bottom row
  if (id >= 11 && id <= 19) return { x: 0,   y: B-C - (id-10)*S, w: C, h: S }; // left col
  if (id >= 21 && id <= 29) return { x: C + (id-21)*S,    y: 0,   w: S, h: C }; // top row
  if (id >= 31 && id <= 39) return { x: B-C, y: C + (id-31)*S,   w: C, h: S }; // right col
  return { x:0, y:0, w:C, h:C };
}

function getSpaceCenter(id) {
  const r = getSpaceRect(id);
  return { x: r.x + r.w/2, y: r.y + r.h/2 };
}

// Returns which "side" a space is on (for color band placement)
function getSpaceSide(id) {
  if (id === 0 || id === 10 || id === 20 || id === 30) return 'corner';
  if (id >= 1  && id <= 9)  return 'bottom';
  if (id >= 11 && id <= 19) return 'left';
  if (id >= 21 && id <= 29) return 'top';
  if (id >= 31 && id <= 39) return 'right';
}

// Shuffle an array in place
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
