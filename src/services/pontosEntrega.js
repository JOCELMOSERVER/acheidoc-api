const { query } = require('../db');

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function listActivePoints() {
  const result = await query(
    `SELECT p.id, p.nome, p.endereco, p.horario, p.telefone, p.provincia, p.municipio,
            p.agente_id, a.nome AS agente_nome
     FROM pontos_entrega p
     LEFT JOIN agentes a ON a.id = p.agente_id
     WHERE p.ativo = TRUE
     ORDER BY p.nome ASC`
  );
  return result.rows;
}

async function findNearestPoint(filters) {
  const provincia = normalize(filters && filters.provincia);
  const municipio = normalize(filters && filters.municipio);
  const points = await listActivePoints();
  if (!points.length) return null;

  const exactMunicipio = points.find((point) => normalize(point.municipio) === municipio && municipio);
  if (exactMunicipio) return exactMunicipio;

  const exactProvincia = points.find((point) => normalize(point.provincia) === provincia && provincia);
  if (exactProvincia) return exactProvincia;

  const fuzzyMatch = points.find((point) => {
    const pointName = normalize(point.nome);
    const pointAddress = normalize(point.endereco);
    return (municipio && (pointName.includes(municipio) || pointAddress.includes(municipio)))
      || (provincia && (pointName.includes(provincia) || pointAddress.includes(provincia)));
  });

  return fuzzyMatch || points[0];
}

module.exports = { listActivePoints, findNearestPoint };