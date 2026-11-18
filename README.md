# DM48 · Frontend

Portada pública, registro de casillero y panel interno para la operación courier USA → Perú. Una aplicación Angular organizada como monolito modular, con autenticación Keycloak y conexión a la API REST de DM48.

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

El botón de sol o luna permite alternar entre los temas claro y oscuro desde
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
    ├── home/
    ├── portal/
    ├── invoices/
    ├── delivery/
    ├── consignees/
    ├── notifications/
    ├── warehouses/
    ├── consolidation/
    ├── airfreight/
    ├── receptions/
    ├── customs/
    ├── customers/
    ├── shipments/
    ├── billing/
    ├── quotes/
    └── overview/
```

Cada módulo reúne sus modelos, servicio, rutas, página y pruebas en archivos directos. Las rutas cargan módulos bajo demanda. Las dependencias entre módulos pasan por sus exportaciones públicas en `index.ts`; `core` y `shared` no dependen de módulos.

La portada pública está en `/`, el alta y casillero propio en `/portal` y el panel del personal en `/internal`. El portal reúne casillero, paquetes, entregas, destinatarios, pagos, comprobantes y avisos.

## Funcionalidad

- Clientes: listado paginado con búsqueda general, orden por fecha o nombre y vendedor asignado. La API limita los resultados según el usuario. Cada fila abre la ficha completa; al volver se conservan los filtros y la página. También permite búsqueda exacta por casillero o DNI/RUC, registro y edición de contacto mediante modal.
- Paquetes: consulta por cliente, prealertas, seguimiento con reintento y factura adjunta editable antes de consolidar.
- Notas de salida: borradores, guías, cargos, destino, liquidación, pagos, revisión de vouchers y PDF.
- Cotizaciones: compra asistida para prospectos o clientes, desglose y PDF. Un prospecto requiere nombre y al menos correo o teléfono; tienda y enlace del producto son opcionales.
- Tarifas courier: vigente e historial consultables por el personal, publicación de versiones exclusiva de administración e inicio opcional programado en hora de Perú. El precio se conserva en centavos de USD por libra; el simulador envía kg decimales y dimensiones enteras en mm y muestra el flete calculado por el backend. Las recepciones conservan la tarifa vigente al recibirse en USA y los cálculos se limpian al cambiar medidas.
- Agencias y sucursales: catálogo consultable por el personal con filtro de activas/inactivas, counter de entrega en Lima y sucursales de recojo en destino. Solo administración puede crear agencias o sucursales; los datos existentes se muestran en lectura. Los errores conservan el borrador y una creación incierta de sucursal bloquea el reenvío hasta revisar el catálogo.
- Rutas de reparto: listado por fecha de Perú, alta con repartidor registrado y almacén activo, comprobación de paquetes antes de asignar, inicio y cierre confirmados y registro selectivo de no entregados con motivo. Solo supervisor/admin; el backend valida pagos y elegibilidad y agrupa las paradas por destino. Los conflictos actualizan la selección conservando el motivo.
- Aduanas: pendientes reales (hasta 200), consulta por referencia o enlace, reporte CSV/XLSX de hasta 5 MB con resultado por grupo y errores por fila, liquidación y constancia con vista previa/descarga y liberación confirmada. Solo supervisor/admin. Los importes conservan USD o PEN y las respuestas inciertas requieren actualizar el detalle.
- Recepción en Lima: apertura para una MAWB despachada en un almacén activo de Perú, escaneos acumulativos de guías/WR, corrección de cantidades con lápiz y modal y cierre confirmado con completos, diferencias, faltantes y sobrantes. Solo supervisor/admin; recuperación desde un listado paginado por número de MAWB o estado y bloqueo ante respuestas inciertas para evitar duplicados.
- Operación aérea: creación y consulta de MAWB desde un listado por número, vuelo o estado, manifiestos de consolidados cerrados con exportación CSV, asociación a vuelos y confirmación de salida. Solo supervisor/admin; fechas explícitas en hora de Perú y cantidades confirmadas por el servidor.
- Resumen: registros recientes y accesos a la operación; sin indicadores globales calculados a partir de muestras.

Las acciones de gestión requieren `admin` o `supervisor`; `seller` accede a las operaciones admitidas para personal. El backend sigue validando permisos, estados y reglas financieras. Ante un conflicto en una nota, el panel consulta su estado actualizado y conserva las entradas; si la consulta falla, bloquea la nota obsoleta hasta volver a cargarla. Los importes se envían como centavos enteros, el peso como texto decimal en kilogramos (hasta tres decimales) y los totales se toman de la API.

## Validación

```bash
pnpm test:core
pnpm check:boundaries
pnpm check:tracked
pnpm test
pnpm format:check
pnpm build
pnpm check:dist
pnpm exec playwright install chromium
pnpm test:e2e
```

`test:core` usa el ejecutor de Node y funciona sin instalar Angular. `test` ejecuta las pruebas Angular con Vitest. Playwright comprueba acceso restringido, teclado, adaptación móvil y los recorridos de registro y edición de clientes, errores por campo, prealertas, carga y apertura de facturas, seguimiento con reintento, creación de notas, edición de destinos, guías y cargos, liquidación, pagos y aceptación/rechazo de pagos pendientes. También cubre cambios de cliente durante la búsqueda, archivos inválidos, fallos de carga y renovación de sesión rechazada. En el resumen comprueba fallos parciales, reintentos independientes, consultas vacías y carga de notas sin bloquear las cotizaciones. Los recorridos usan dobles de OIDC y de la API exclusivos de las pruebas, sin credenciales ni escrituras reales. Además verifica la renovación simultánea de sesión, la anulación con motivo, los formularios de cotización tras errores 422/403/409, la descarga y renovación de enlaces PDF, el bloqueo de doble envío y la restauración de paquetes desde la URL. Comprueba foco y teclado en diálogos y navegación, y desbordamiento de los módulos a 390 y 1440 px. También se comprueba la indisponibilidad del proveedor de identidad. No sustituyen una prueba de sesión y escrituras contra servicios de desarrollo reales.

La API actual de notas devuelve el estado y la referencia de cada pago, pero no su `evidence_document_id`. Se puede registrar evidencia y aceptar o rechazar pagos pendientes; abrir el comprobante desde la lista requiere que el backend exponga ese identificador o un enlace autorizado.

## Compilación y despliegue

`pnpm build` produce `dist/dm48/browser/`. Sirve esa carpeta con HTTPS y configura el servidor para devolver `index.html` en las rutas de la SPA. Configura `/api` mediante un proxy del servidor de producción o establece una URL absoluta con CORS adecuado. El proxy de desarrollo no se incluye en la distribución.

En producción registra el dominio y callbacks HTTPS en Keycloak. No se configura un despliegue automático hasta definir el destino.

## Contribuciones

Rama principal: `main`. Usa identificadores en inglés, textos de interfaz en español y mensajes como `feat(shipments): añadir seguimiento de paquetes`. Incluye el archivo de bloqueo, ejecuta las validaciones relevantes y revisa las rutas preparadas antes de cada commit.

## Portada y registro de casillero

`/` presenta la empresa, servicios, pasos del envío y preguntas frecuentes. La
portada carga sin esperar a Keycloak. «Crear mi casillero» abre el registro del
cliente público OIDC configurado; `/login` sirve a clientes y personal. Tras
iniciar sesión, el personal accede a `/internal/overview` y el cliente a `/portal`.

El área inicial de clientes permite completar DNI/RUC, nombre y teléfono, y
consultar el código y direcciones reales del casillero. Usa `GET /portal/me`,
`POST /portal/onboarding` y `GET /portal/link-request`. Si el documento requiere
vinculación, muestra el estado de revisión sin revelar el casillero existente.
El portal también incluye `/portal/packages` (paquetes, prealertas, seguimiento y
factura adjunta), `/portal/payments` (notas, saldos, PDF y reporte de pagos con
comprobante obligatorio) y `/portal/invoices` (boletas, facturas, notas de crédito y
archivos PDF/XML/CDR disponibles). Los pagos enviados por el cliente quedan
pendientes de revisión; no se descuentan del saldo hasta su confirmación. La evidencia
se sube con un permiso temporal de `/documents/uploads`, un PUT sin credenciales
de sesión a la URL firmada y la confirmación `/documents/uploads/:id/complete`.

El portal usa las rutas propias de la cuenta autenticada, sin seleccionar un
`customer_id`. El módulo del personal mantiene sus rutas y permisos independientes.
La factura comercial del paquete puede adjuntarse o reemplazarse antes de consolidar;
la API del portal no expone su identificador para previsualizarla.

Los datos públicos de la empresa están en `public/business-info.json`: razón
social, RUC y domicilio fiscal. Completa `email`, `phone` y `hours` cuando estén
definidos; los campos vacíos se omiten de la portada. No copies configuración
privada a ese archivo. Mantén habilitado el registro público en Keycloak y registra
los callbacks `/login` y `/portal` en las URLs permitidas de `dm48-web`.

## Entregas, destinatarios y avisos

- `/portal/delivery`: preferencia de recepción por paquete, direcciones registradas y agencias disponibles. El alta y edición de direcciones corresponden al personal; el portal solo las consulta. Las restricciones por estado e intentos fallidos se respetan al elegir destino.
- `/portal/consignees`: libreta de destinatarios con autorización explícita, verificación del documento, uso anual, asignación a paquetes propios y baja confirmada. El consentimiento y los límites proceden de la API; una guía emitida impide cambiar al consignatario.
- `/portal/notifications`: avisos de la cuenta, búsqueda y acceso a paquetes o notas relacionados. No hay estado de lectura en el contrato. Solo se convierten en navegación los enlaces conocidos del mismo origen.

Los tres módulos usan exclusivamente endpoints `/portal/`. Playwright comprueba las dependencias entre agencia y sucursal, el consentimiento, la recuperación de conflictos de asignación y la navegación segura de avisos con respuestas simuladas.

## Almacenes y recepción

- `/internal/warehouses`: catálogo consultable por todo el personal. Solo administración crea y actualiza sedes; el código y país se conservan después del alta. Los almacenes inactivos mantienen su historial.
- `/internal/warehouses/receiving`: supervisión y administración registran llegadas en sedes activas de Estados Unidos. Peso en kilogramos (0.001–500 kg, hasta tres decimales; se acepta coma decimal), dimensiones en milímetros y al menos una foto JPEG, PNG o WEBP (15 MB por archivo). La nota de entrada, el peso facturable y el flete se muestran según la respuesta del backend; sus medidas son inmutables.
- `/internal/warehouses/unidentified`: cola de paquetes sin propietario. La asignación requiere resolver un cliente por casillero; editar la búsqueda o cambiar de paquete descarta el cliente anterior.

Las recepciones usan `POST /warehouse/receipts`; la cola usa `GET /warehouse/unidentified` y la asignación `POST /packages/:id/assign`. Las fotografías se suben al servicio de documentos antes de registrar la recepción y se conservan en el formulario tras errores recuperables. Los recorridos de navegador usan API simulada y no realizan escrituras reales.

## Bultos y consolidados

- `/internal/bulks`: supervisión y administración crean un bulto en un almacén activo de USA. El listado paginado permite retomar bultos por código, precinto o estado. El selector de paquetes busca por tracking, descripción, casillero o cliente; comprueba que sean courier recibidos, identificados y con factura. El retiro exige un motivo. El cierre requiere precinto y medidas finales (g/mm), con confirmación; después no se modifica el contenido. La etiqueta PDF procede del backend.
- `/internal/consolidations`: lista los consolidados por código y estado, separa la creación de la consulta y permite seleccionar bultos cerrados, sin asignar y del mismo almacén. El cierre confirmado emite las guías HAWB y fija los consignatarios según las reglas del backend. Las guías solo aparecen tras la respuesta confirmada.

Los listados consultan el backend con `q`, `status`, `limit` y `offset`; los selectores añaden `free=true` y el almacén cuando corresponde. La operación aérea selecciona consolidados cerrados sin MAWB; las recepciones seleccionan vuelos despachados. Las rutas de reparto seleccionan paquetes `READY_FOR_DELIVERY`. Antes de asociar se consulta el detalle y el servidor valida la operación. Los enlaces directos existentes siguen funcionando, sin exigir escribir identificadores técnicos.

Estas vistas usan `/bulks` y `/consolidations`, con permisos de supervisión o administración. Los errores conservan las entradas recuperables; los detalles secundarios se reintentan sin perder las referencias canónicas. Las pruebas de navegador usan respuestas simuladas, sin operaciones reales sobre la API.

## Apariencia e interacción

La paleta usa ciruela eclipse como base dominante (60 %), seda titanio para superficies secundarias (30 %) y destello ámbar en acciones y énfasis (10 %). Los temas claro y oscuro comparten una jerarquía de superficies para navegación, tablas, formularios y detalle. Los estados usan colores semánticos y el foco permanece visible. El cambio de tema conserva la preferencia y el barrido de esquina a esquina al usar el puntero.

El movimiento explica acciones: trazado inicial USA–Perú en portada, respuesta breve al pulsar y transición de diálogos. La navegación y las tablas no añaden esperas. Con teclado o movimiento reducido se desactivan los desplazamientos de componentes; el cambio de tema por teclado es inmediato.

La navegación de la portada desplaza suavemente entre secciones al usar el puntero; con teclado o movimiento reducido mantiene el salto nativo inmediato. El cierre y el footer agrupan creación de casillero, contacto, domicilio fiscal, ayuda y datos legales. Correo, teléfono y horarios se muestran solo cuando están configurados en `public/business-info.json`.

El portal de clientes usa navegación lateral en escritorio y un menú desplegable en móvil. El menú móvil conserva el foco, se cierra con Escape y se adapta al cambiar de tamaño. La vista del casillero distribuye código y dirección en dos columnas cuando hay espacio, conservando una sola columna en pantallas pequeñas.

## Cotizaciones y envío por correo

La captura admite impuesto Perú en modo automático, aplicar o no aplicar; porcentaje de viajero, suplementos con sus unidades, delivery en Lima, despacho a agencia y vigencia opcional por fecha de Lima. Los cargos configurables que no pueden calcularse con los datos disponibles permanecen pendientes hasta guardar. El detalle conserva el desglose y la cantidad de aduana confirmados por el backend.

«Guardar sin correo» registra la propuesta; «Guardar y enviar» solicita además su envío con PDF. Si falla el correo, la cotización permanece guardada y puede reenviarse desde su detalle mediante `POST /quotes/:id/send`. El catálogo determina qué precios de extras pueden editarse; los automáticos omiten el precio para respetar la tarifa del cliente. Las pruebas de navegador usan API simulada y no envían correos reales.

Los PDF de cotizaciones, notas y comprobantes se pueden consultar en una vista previa
con páginas, zoom y descarga. Los listados ofrecen «Ver» y «Descargar» por separado.
El visor carga PDF.js bajo demanda y también muestra las imágenes adjuntas como
factura de paquetes. Al cerrar, cancela la carga y libera sus recursos. Los enlaces
firmados se consultan sin el token de la API; cada reintento solicita un enlace nuevo.

Para el almacenamiento local Floci, `documentProxyOrigin` en `app-config.json`
redirige únicamente `http://localhost:4566` por `/document-storage`, configurado en
`proxy.conf.json`. Reinicia `pnpm start` si cambias el proxy. En producción, permite
GET y PUT desde el origen del frontend mediante CORS en el almacenamiento o configura
una ruta equivalente en el servidor web y su origen en `documentProxyOrigin`;
elimina esta opción si los archivos se consultan directamente con CORS habilitado.

## Espacio del repartidor

La ruta `/driver` requiere el rol `driver`; una cuenta de reparto entra allí después de iniciar sesión. El registro en `/driver/me` precede a la consulta de sus rutas por fecha de Perú. Solo las rutas en curso permiten registrar resultados; supervisión conserva el inicio y cierre.

La entrega exige selección explícita de paquetes pendientes, receptor con documento válido, foto o video y ubicación obtenida mediante una acción del usuario. En el counter de una agencia también exige su guía. Un intento fallido requiere motivo; ubicación y evidencia son opcionales. Los conflictos actualizan los pendientes sin borrar el borrador y una lectura fallida bloquea nuevas operaciones.

Las evidencias usan subidas firmadas: hasta diez fotos (15 MB cada una) o videos MP4/MOV (200 MB cada uno). Las referencias de subidas completadas se conservan durante los reintentos del registro. El almacenamiento no recibe el token de sesión y el proxy local también admite PUT. En producción, la ubicación del navegador requiere HTTPS y permiso del usuario. Las pruebas simulan API, archivos y GPS, sin entregas reales.
