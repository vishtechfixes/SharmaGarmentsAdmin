// ============================================================
//  shared/constants.js — Sharma Garments
//  Admin aur Customer DONO mein yeh same file rakho
// ============================================================

export const SHOP = {
  id:           "sharma-garments",
  name:         "Sharma Garments",
  tagline:      "Style Mein Jiyo!",
  location:     "Jaipur",
  logoEmoji:    "👗",
  primaryColor: "#1a237e",
  accentColor:  "#FFD700",

  whatsapp:     "917732997349",       // ← Owner ka WhatsApp add karo
  instagram:    "",
  zomato:       "",
  googleReview: "",
  appLink:      "https://sharmagarments.vishtechfixes.com",
};

// ── ADMIN ──────────────────────────────────────────────────
export const ADMIN = {
  defaultPassword: "sg2025",
};

// ── POINTS CONFIG ───────────────────────────────────────────
export const POINTS = {
  welcome:       300,   // Kapda shop = zyada points (bada ticket size)
  perVisit:      20,
  instagram:     25,
  googleReview:  30,
  whatsapp:      20,
  zomato:        0,
};

// ── OFFER DEFAULTS ──────────────────────────────────────────
export const DEFAULTS = {
  welcomeDiscPct:  10,
  visitGoal:       5,
  visitReward:     "Rs.200 OFF Next Purchase",
  refSteps:        [100, 250, 500],
  winbackDays:     45,
  lowStockAlert:   5,
  billPointsMsg:   true,
};

// ── COUPON PREFIXES ─────────────────────────────────────────
export const COUPON = {
  welcome:  "SG",
  birthday: "SGBDAY",
  visit:    "SGVIS",
  special:  "SGSPEC",
};

// ── MENU CATEGORIES ─────────────────────────────────────────
export const CATEGORIES = [
  "Men's Wear",
  "Women's Wear",
  "Kids Wear",
  "Ethnic Wear",
  "Western Wear",
  "Sarees",
  "Suits & Salwar",
  "Lehenga & Choli",
  "Winter Collection",
  "Accessories",
  "Footwear",
  "Sale Items",
];

// ── FIRESTORE COLLECTION NAMES ──────────────────────────────
export const COLLECTIONS = {
  users:    "users",
  bills:    "bills",
  menu:     "menu",
  settings: "settings",
  shop:     "shop",
  feedback: "feedback",
};

// ── LOCALSTORAGE KEYS ───────────────────────────────────────
export const LS = {
  users:    "sg_users",
  bills:    "sg_bills",
  menu:     "sg_menu",
  settings: "sg_settings",
  shop:     "sg_shop",
  feedback: "sg_feedback",
  theme:    "sg_theme",
  adminPw:  "sg_admin_pass",
  current:  "sg_current",
};











