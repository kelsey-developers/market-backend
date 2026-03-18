import path from 'path';

/** Resolve repository root for both src/* (tsx) and dist/* (node) runtimes. */
export const getProjectRootPath = () => path.resolve(__dirname, '..', '..');

export const getUploadsPath = () => path.join(getProjectRootPath(), 'uploads');

export const getDamageIncidentUploadsPath = () => path.join(getUploadsPath(), 'damage-incidents');

export const getOpenApiServedPath = () => path.join(getProjectRootPath(), 'openapi-served.json');
