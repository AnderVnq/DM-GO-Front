# DM48 · Frontend

Panel interno para la operación courier USA → Perú. Una aplicación Angular organizada como monolito modular, con autenticación Keycloak y conexión a la API REST de DM48.

## Requisitos

- Node.js 24 y pnpm 11.
- Angular 21 LTS, resuelto mediante las dependencias del proyecto.
- API en `http://localhost:8080`.
- Keycloak en `http://localhost:8081`, realm `dm48`, cliente público `dm48-web`, Authorization Code con PKCE S256.

## Desarrollo

```bash
pnpm install
pnpm start
```

Abre `http://localhost:3000`. El servidor de desarrollo envía `/api/**` al backend mediante `proxy.conf.json`. Los callbacks y orígenes del cliente Keycloak deben admitir `http://localhost:3000/*`.

Las dependencias están fijadas en `pnpm-lock.yaml`. Usa `pnpm install --frozen-lockfile` para reproducir la instalación; requiere acceso al registro npm. No es necesario instalar Angular globalmente.

## Apariencia

El botón de sol o luna permite alternar entre los temas azul claro y oscuro desde
el acceso y la cabecera del panel. El tema oscuro se revela desde la esquina superior derecha hasta la inferior izquierda
en 400 ms; al volver a claro el barrido se invierte. Con movimiento reducido o en
navegadores sin soporte del efecto, el cambio es inmediato. La elección se guarda en este navegador. Sin
una elección guardada se utiliza la apariencia del sistema, incluyendo sus cambios.
El selector funciona con teclado y sigue disponible si el navegador bloquea el
almacenamiento local; en ese caso la elección dura durante la sesión de la página.

## Configuración pública

Edita `public/app-config.json` antes de servir o desplegar:

```json
{
  "apiBaseUrl": "/api/v1",
  "oidcUrl": "http://localhost:8081",
  "oidcRealm": "dm48",
  "oidcClientId": "dm48-web"
}
```

Este archivo se descarga al iniciar. No coloques contraseñas, tokens, claves de proveedores ni un client secret: el cliente web es público. Los tokens de sesión se mantienen en memoria y se adjuntan únicamente a la API configurada.

## Organización

```text
src/app/
├── core/       # configuración, sesión, permisos y HTTP
├── shared/     # controles, iconos y formatos
├── layout/     # estructura visual y navegación
└── modules/
    ├── customers/
    ├── shipments/
    ├── billing/
    ├── quotes/
    └── overview/
```

Cada módulo reúne sus modelos, servicio, rutas, página y pruebas en archivos directos. Las rutas cargan módulos bajo demanda. Las dependencias entre módulos pasan por sus exportaciones públicas en `index.ts`; `core` y `shared` no dependen de módulos.

Solo está implementada el área `/internal`. El portal de clientes se añadirá posteriormente dentro de la misma aplicación.

## Funcionalidad

- Clientes: búsqueda por casillero o DNI/RUC, registro y actualización de contacto.
- Paquetes: consulta por cliente, prealertas, seguimiento y factura adjunta.
- Notas de salida: borradores, guías, cargos, destino, liquidación, pagos, revisión de vouchers y PDF.
- Cotizaciones: compra asistida para prospectos o clientes, desglose y PDF.
- Resumen: registros recientes y accesos a la operación; sin indicadores globales calculados a partir de muestras.

Las acciones de gestión requieren `admin` o `supervisor`; `seller` accede a las operaciones admitidas para personal. El backend sigue validando permisos, estados y reglas financieras. Los importes se envían como centavos enteros, el peso como gramos y los totales se toman de la API.

## Validación

```bash
pnpm test:core
pnpm check:boundaries
pnpm test
pnpm format:check
pnpm build
pnpm check:dist
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:core` usa el ejecutor de Node y funciona sin instalar Angular. `test` ejecuta las pruebas Angular con Vitest. Playwright comprueba acceso restringido, teclado, adaptación móvil y los recorridos de clientes, prealertas, creación de notas, edición de destinos, guías y cargos, liquidación, pagos y aceptación/rechazo de pagos pendientes. También cubre cambios de cliente durante la búsqueda, archivos inválidos, fallos de carga y renovación de sesión rechazada. Los recorridos usan dobles de OIDC y de la API exclusivos de las pruebas, sin credenciales ni escrituras reales. También se comprueba la indisponibilidad del proveedor de identidad. No sustituyen una prueba de sesión y escrituras contra servicios de desarrollo reales.

La API actual de notas devuelve el estado y la referencia de cada pago, pero no su `evidence_document_id`. Se puede registrar evidencia y aceptar o rechazar pagos pendientes; abrir el comprobante desde la lista requiere que el backend exponga ese identificador o un enlace autorizado.

## Compilación y despliegue

`pnpm build` produce `dist/dm48/browser/`. Sirve esa carpeta con HTTPS y configura el servidor para devolver `index.html` en las rutas de la SPA. Configura `/api` mediante un proxy del servidor de producción o establece una URL absoluta con CORS adecuado. El proxy de desarrollo no se incluye en la distribución.

En producción registra el dominio y callbacks HTTPS en Keycloak. No se configura un despliegue automático hasta definir el destino.

## Contribuciones

Rama principal: `main`. Usa identificadores en inglés, textos de interfaz en español y mensajes como `feat(shipments): añadir seguimiento de paquetes`. Incluye el archivo de bloqueo, ejecuta las validaciones relevantes y revisa las rutas preparadas antes de cada commit.
