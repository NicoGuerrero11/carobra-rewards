// Introductory copy for visual review, not a quote or eligibility determination.
// Reward amounts were confirmed for this display by the owner; they are not award rules.
// Crediting conditions and backend activation are outside this presentation change.
export const productOffers = [
  {
    id: "skandia", name: "Skandia", category: "Ahorro y planeación",
    logo: "/images/products/skandia.svg", logoWidth: 960, logoHeight: 200,
    headline: "Tus grandes planes merecen un siguiente paso.",
    description: "Ese proyecto que imaginas. La etapa que viene. Empieza a construir tu futuro con opciones de ahorro y planeación de Skandia.",
    themes: ["Tus metas", "Tu futuro"],
    contactLabel: "Quiero empezar a ahorrar",
    displayRewardPoints: 600,
  },
  {
    id: "qualitas", name: "Quálitas", category: "Seguro de auto",
    logo: "/images/products/qualitas.png", logoWidth: 161, logoHeight: 54,
    headline: "Disfruta el camino. Dale protección a tu auto.",
    description: "De los recorridos de todos los días a tu próxima escapada. Encuentra una opción de seguro para tu auto con Quálitas.",
    themes: ["Tu auto", "Tu tranquilidad"],
    contactLabel: "Quiero proteger mi auto",
    displayRewardPoints: 150,
  },
  {
    id: "modalidad", name: "Modalidad 40", category: "Orientación para el retiro",
    logo: null, logoWidth: 0, logoHeight: 0,
    headline: "Tu próxima etapa empieza con lo que decides hoy.",
    description: "Más tiempo para ti y para lo que disfrutas. Descubre si Modalidad 40 puede formar parte de tus planes de retiro.",
    themes: ["Tu retiro", "Tus próximos años"],
    contactLabel: "Quiero planear mi retiro",
    displayRewardPoints: 600,
  },
].map((offer) => ({
  ...offer,
  contactHref: `mailto:soporte@carobra.mx?subject=${encodeURIComponent(`Quiero información sobre ${offer.name}`)}`,
}));
