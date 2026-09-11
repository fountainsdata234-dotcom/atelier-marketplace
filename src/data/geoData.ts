import { CountryGeo } from '../types';

export const WORLD_COUNTRIES: CountryGeo[] = [
  {
    name: "Nigeria",
    code: "NG",
    dialCode: "+234",
    flag: "🇳🇬",
    lat: 9.0820,
    lng: 8.6753,
    states: [
      { name: "Lagos", cities: ["Ikeja", "Victoria Island", "Lekki", "Surulere", "Yaba", "Ikoyi", "Alaba"] },
      { name: "Abuja (FCT)", cities: ["Garki", "Wuse", "Maitama", "Asokoro", "Gwarinpa", "Jabi"] },
      { name: "Rivers", cities: ["Port Harcourt", "Obio-Akpor", "Bonny", "Eleme"] },
      { name: "Oyo", cities: ["Ibadan", "Ogbomosho", "Oyo", "Iseyin"] },
      { name: "Kano", cities: ["Kano Municipal", "Fagge", "Dala", "Gwale"] },
      { name: "Edo", cities: ["Benin City", "Uromi", "Auchi", "Ekpoma"] },
      { name: "Anambra", cities: ["Awka", "Onitsha", "Nnewi"] },
      { name: "Enugu", cities: ["Enugu City", "Nsukka", "Udi"] },
      { name: "Delta", cities: ["Warri", "Asaba", "Sapele", "Ughelli"] },
      { name: "Ogun", cities: ["Abeokuta", "Ijebu Ode", "Sagamu", "Ota"] }
    ]
  },
  {
    name: "United Kingdom",
    code: "GB",
    dialCode: "+44",
    flag: "🇬🇧",
    lat: 55.3781,
    lng: -3.4360,
    states: [
      { name: "Greater London", cities: ["London (Savile Row)", "Westminster", "Mayfair", "Soho", "Camden", "Shoreditch", "Chelsea"] },
      { name: "Greater Manchester", cities: ["Manchester", "Salford", "Bolton", "Stockport"] },
      { name: "West Midlands", cities: ["Birmingham", "Coventry", "Wolverhampton"] },
      { name: "West Yorkshire", cities: ["Leeds", "Bradford", "Huddersfield"] },
      { name: "Scotland", cities: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee"] },
      { name: "Wales", cities: ["Cardiff", "Swansea", "Newport"] }
    ]
  },
  {
    name: "United States",
    code: "US",
    dialCode: "+1",
    flag: "🇺🇸",
    lat: 37.0902,
    lng: -95.7129,
    states: [
      { name: "New York", cities: ["New York City (Garment District)", "Brooklyn", "Queens", "Buffalo", "Rochester"] },
      { name: "California", cities: ["Los Angeles (Fashion District)", "San Francisco", "San Diego", "San Jose", "Beverly Hills"] },
      { name: "Texas", cities: ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth"] },
      { name: "Florida", cities: ["Miami", "Orlando", "Tampa", "Fort Lauderdale"] },
      { name: "Illinois", cities: ["Chicago", "Naperville", "Rockford"] },
      { name: "Georgia", cities: ["Atlanta", "Savannah", "Augusta"] }
    ]
  },
  {
    name: "France",
    code: "FR",
    dialCode: "+33",
    flag: "🇫🇷",
    lat: 46.2276,
    lng: 2.2137,
    states: [
      { name: "Île-de-France", cities: ["Paris (Haute Couture)", "Boulogne-Billancourt", "Saint-Denis", "Versailles"] },
      { name: "Auvergne-Rhône-Alpes", cities: ["Lyon (Silk Center)", "Grenoble", "Saint-Étienne"] },
      { name: "Provence-Alpes-Côte d'Azur", cities: ["Marseille", "Nice", "Cannes", "Aix-en-Provence"] },
      { name: "Nouvelle-Aquitaine", cities: ["Bordeaux", "Limoges", "Poitiers"] }
    ]
  },
  {
    name: "Italy",
    code: "IT",
    dialCode: "+39",
    flag: "🇮🇹",
    lat: 41.8719,
    lng: 12.5674,
    states: [
      { name: "Lombardy", cities: ["Milan (Quadrilatero della Moda)", "Bergamo", "Brescia", "Como"] },
      { name: "Tuscany", cities: ["Florence (Pitti Uomo)", "Pisa", "Siena", "Prato"] },
      { name: "Lazio", cities: ["Rome", "Latina", "Viterbo"] },
      { name: "Veneto", cities: ["Venice", "Verona", "Padua", "Vicenza"] },
      { name: "Campania", cities: ["Naples (Neapolitan Tailoring)", "Salerno"] }
    ]
  },
  {
    name: "Ghana",
    code: "GH",
    dialCode: "+233",
    flag: "🇬🇭",
    lat: 7.9465,
    lng: -1.0232,
    states: [
      { name: "Greater Accra", cities: ["Accra", "Tema", "Madina", "Osu", "East Legon"] },
      { name: "Ashanti", cities: ["Kumasi", "Obuasi", "Ejisu"] },
      { name: "Western", cities: ["Sekondi-Takoradi", "Tarkwa"] },
      { name: "Central", cities: ["Cape Coast", "Kasoa"] }
    ]
  },
  {
    name: "South Africa",
    code: "ZA",
    dialCode: "+27",
    flag: "🇿🇦",
    lat: -30.5595,
    lng: 22.9375,
    states: [
      { name: "Gauteng", cities: ["Johannesburg", "Pretoria", "Sandton", "Soweto"] },
      { name: "Western Cape", cities: ["Cape Town", "Stellenbosch", "George"] },
      { name: "KwaZulu-Natal", cities: ["Durban", "Pietermaritzburg"] },
      { name: "Eastern Cape", cities: ["Gqeberha", "East London"] }
    ]
  },
  {
    name: "Kenya",
    code: "KE",
    dialCode: "+254",
    flag: "🇰🇪",
    lat: -0.0236,
    lng: 37.9062,
    states: [
      { name: "Nairobi County", cities: ["Nairobi (Westlands)", "Kilimani", "Karen", "CBD"] },
      { name: "Mombasa County", cities: ["Mombasa", "Nyali", "Likoni"] },
      { name: "Kisumu County", cities: ["Kisumu", "Ahero"] },
      { name: "Nakuru County", cities: ["Nakuru", "Naivasha"] }
    ]
  },
  {
    name: "India",
    code: "IN",
    dialCode: "+91",
    flag: "🇮🇳",
    lat: 20.5937,
    lng: 78.9629,
    states: [
      { name: "Maharashtra", cities: ["Mumbai", "Pune", "Nagpur", "Thane"] },
      { name: "Delhi NCR", cities: ["New Delhi", "Noida", "Gurugram"] },
      { name: "Karnataka", cities: ["Bengaluru", "Mysuru", "Mangalore"] },
      { name: "Gujarat", cities: ["Surat (Textile Hub)", "Ahmedabad", "Vadodara"] },
      { name: "Tamil Nadu", cities: ["Chennai", "Coimbatore", "Madurai"] }
    ]
  },
  {
    name: "Canada",
    code: "CA",
    dialCode: "+1",
    flag: "🇨🇦",
    lat: 56.1304,
    lng: -106.3468,
    states: [
      { name: "Ontario", cities: ["Toronto", "Ottawa", "Mississauga", "Hamilton"] },
      { name: "Quebec", cities: ["Montreal (Fashion Mile)", "Quebec City", "Laval"] },
      { name: "British Columbia", cities: ["Vancouver", "Victoria", "Surrey"] },
      { name: "Alberta", cities: ["Calgary", "Edmonton"] }
    ]
  },
  {
    name: "United Arab Emirates",
    code: "AE",
    dialCode: "+971",
    flag: "🇦🇪",
    lat: 23.4241,
    lng: 53.8478,
    states: [
      { name: "Dubai", cities: ["Dubai Design District (d3)", "Deira", "Jumeirah", "Downtown Dubai"] },
      { name: "Abu Dhabi", cities: ["Abu Dhabi City", "Al Ain", "Al Dhafra"] },
      { name: "Sharjah", cities: ["Sharjah City", "Khor Fakkan"] }
    ]
  },
  {
    name: "Germany",
    code: "DE",
    dialCode: "+49",
    flag: "🇩🇪",
    lat: 51.1657,
    lng: 10.4515,
    states: [
      { name: "Berlin", cities: ["Berlin Mitte", "Charlottenburg", "Kreuzberg"] },
      { name: "Bavaria", cities: ["Munich", "Nuremberg", "Augsburg"] },
      { name: "North Rhine-Westphalia", cities: ["Düsseldorf (Fashion Hub)", "Cologne", "Dortmund"] },
      { name: "Hamburg", cities: ["Hamburg", "Altona"] }
    ]
  },
  {
    name: "Australia",
    code: "AU",
    dialCode: "+61",
    flag: "🇦🇺",
    lat: -25.2744,
    lng: 133.7751,
    states: [
      { name: "New South Wales", cities: ["Sydney", "Newcastle", "Wollongong"] },
      { name: "Victoria", cities: ["Melbourne (Fashion Precinct)", "Geelong"] },
      { name: "Queensland", cities: ["Brisbane", "Gold Coast", "Cairns"] }
    ]
  }
];

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
