import { validateDemoFields, type DemoStep, type DemoAnswers, type DemoIssue } from './demo-product-wizard.ts';

export type QualitasJourney = 'cotizar' | 'mejorar';
const vehicle: DemoStep = {
  title: 'Tu auto', description: 'Imagina el auto que quieres proteger. Usa datos de ejemplo.',
  fields: [
    { name: 'brand', label: 'Marca', type: 'text', placeholder: 'Ej. Toyota', maxLength: 40 },
    { name: 'model', label: 'Modelo', type: 'text', placeholder: 'Ej. Corolla', maxLength: 60 },
    { name: 'year', label: 'Año del modelo', type: 'text', inputmode: 'numeric', placeholder: 'Ej. 2023', maxLength: 4, hint: 'Cuatro dígitos. No determina si el auto es asegurable.' },
    { name: 'version', label: 'Versión', type: 'text', optional: true, maxLength: 80, placeholder: 'Si la conoces' },
    { name: 'postalCode', label: 'Código postal', type: 'text', inputmode: 'numeric', placeholder: 'Ej. 01010', maxLength: 5, hint: 'Usa un CP ficticio de cinco dígitos; no pedimos domicilio.' },
    { name: 'use', label: 'Uso del auto', type: 'select', options: ['Particular', 'Trabajo o negocio', 'Transporte por plataforma', 'Otro uso / por definir'], hint: 'La disponibilidad de cobertura para cada uso requiere validación.' },
  ],
};
const driver: DemoStep = {
  title: 'Al volante', description: 'Explora el perfil de quien usaría el auto, sin datos de identidad.',
  fields: [
    { name: 'driver', label: '¿Quién conduce habitualmente?', type: 'select', options: ['Yo', 'Otra persona', 'Varias personas'] },
    { name: 'ageGroup', label: 'Edad del conductor principal', type: 'select', options: ['Menos de 25 años', '25 a 39 años', '40 a 59 años', '60 años o más', 'Por definir'], hint: 'Rangos ilustrativos; no son requisitos de contratación.' },
  ],
  note: 'No necesitas ingresar nombre, licencia, placas ni número de serie del vehículo para esta prueba.',
};
const coverageOptions = ['Amplia', 'Limitada', 'Responsabilidad civil', 'Necesito orientación'];
const urgency = { name: 'urgency', label: '¿Cuándo te gustaría contar con protección?', type: 'select' as const, options: ['Lo antes posible', 'Al vencer mi póliza', 'Más adelante', 'Solo estoy explorando'] };
const contact: DemoStep = { title: 'Contacto de prueba', description: 'Así se vería el contacto al terminar el recorrido.', fields: [], contact: true };
export const qualitasSteps: Record<QualitasJourney, DemoStep[]> = {
  cotizar: [vehicle, driver,
    { title: 'Tu protección', description: 'Elige qué te gustaría explorar. La cobertura final depende del producto y sus condiciones.', fields: [
      { name: 'coverage', label: 'Cobertura que te interesa', type: 'select', options: coverageOptions },
      { name: 'priority', label: '¿Qué es más importante para ti?', type: 'select', options: ['Proteger mi auto', 'Protección frente a daños a terceros', 'Equilibrar protección y costo', 'Entender mis opciones'] },
    ] },
    { title: 'Tu momento', description: 'Esta preferencia no reserva una fecha ni promete un tiempo de atención.', fields: [urgency] }, contact],
  mejorar: [vehicle, driver,
    { title: 'Tu seguro actual', description: 'Puede ser de Quálitas o de otra aseguradora. Usa una póliza ficticia para explorar.', fields: [
      { name: 'insurer', label: 'Aseguradora actual', type: 'select', options: ['Quálitas', 'Otra aseguradora', 'No lo tengo a mano'] },
      { name: 'currentCoverage', label: 'Cobertura actual', type: 'select', options: ['Amplia', 'Limitada', 'Responsabilidad civil', 'No lo sé'] },
      { name: 'expiry', label: 'Fecha de vencimiento', type: 'date', hint: 'Fecha ficticia. También puede ser una póliza ya vencida.' },
    ], note: 'Póliza de ejemplo: DEMO-0001. No ingreses tu número real ni adjuntes documentos. La carga de archivos no está disponible en esta prueba.' },
    { title: 'Lo que quieres cambiar', description: 'Comparar opciones no garantiza un menor precio ni una mejora de cobertura.', fields: [
      { name: 'change', label: '¿Qué te gustaría revisar?', type: 'select', options: ['Coberturas', 'Deducible', 'Costo', 'Servicio y atención', 'Varias condiciones de mi seguro'] },
      { name: 'coverage', label: 'Cobertura que te interesa', type: 'select', options: coverageOptions }, urgency,
    ] }, contact],
};

export function validateQualitas(answers: DemoAnswers, journey: QualitasJourney, step: number, year = new Date().getFullYear()): DemoIssue | null {
  const base = validateDemoFields(qualitasSteps[journey], answers, step);
  if (base) return base;
  if (step === 0) {
    if (!/^[0-9]{4}$/.test(answers.year ?? '') || Number(answers.year) < 1000 || Number(answers.year) > year + 1) {
      return { field: 'year', message: 'Usa un año de cuatro dígitos que no sea posterior al próximo año. No es una regla de aceptación del seguro.' };
    }
    if (!/^[0-9]{5}$/.test(answers.postalCode ?? '')) return { field: 'postalCode', message: 'El código postal debe tener cinco dígitos.' };
  }
  return null;
}
