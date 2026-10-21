# Ginko

## Presentación

Esta integración trae **Ginko**, la red de autobuses y tranvía del Gran Besanzón, a Gladys: los **próximos pasos en tiempo real** en las paradas que elijas (tres en el formulario, hasta 20 más con un botón), filtrados por línea y dirección, y el **tráfico** de hasta seis líneas (normal, con incidencias, interrumpida, con los avisos de Ginko). Cada parada y cada línea se convierte en un dispositivo que puedes mostrar en un panel y usar en escenas.

Los datos proceden de la **API de datos abiertos de Ginko** (Keolis Besançon Mobilités, para Grand Besançon Métropole), bajo licencia ODbL. Las paradas se leen cada minuto por defecto (cada 10 minutos mientras una parada no anuncia nada, de noche), el tráfico cada 5 minutos. Las líneas y paradas de la red las guarda la integración y las vuelve a leer una vez al día y una vez a la semana.

Es una integración **cloud**: contacta con `api.ginko.voyage` con tu clave. Nada más sale de tu red.

## Requisitos

- Gladys Assistant 5.1.1 o posterior.
- Una **clave de API de Ginko**, gratuita: pídela por correo a ginko.support-ssi@keolis.com. Para probar primero, la web [api.ginko.voyage](https://api.ginko.voyage/) da una clave temporal válida 24 horas (sección «Clé temporaire»).

## Configuración

| Campo                  | Qué escribir                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Clave de API           | La clave enviada por Ginko, o la clave temporal del día.                                                                          |
| Parada 1, 2, 3         | El nombre de la parada («Chamars», «Gare Viotte») para ambos lados de la calle, o un identificador («t_cham1») para un solo lado. |
| Línea                  | Solo esta línea: «T1», «L3», «3», «Plan B», «51». Vacío: todas las líneas de la parada.                                           |
| Dirección              | Solo los destinos que contienen estas palabras: «Chalezeule», «Temis \| Gare Viotte». Vacío: ambos sentidos.                      |
| Líneas seguidas        | Las líneas cuyo tráfico sigues, hasta seis: «T1, L3, 7».                                                                          |
| Lectura de las paradas | Cada 30 segundos, minuto, 2 minutos o 5 minutos.                                                                                  |
| Idioma de los textos   | Nombres de los dispositivos, resúmenes y salidas de las escenas. Los nombres de paradas y los avisos de Ginko siguen en francés.  |

El botón **Buscar una parada** da los nombres exactos de las paradas que contienen algunas palabras, con el identificador de cada lado de la calle y las direcciones que allí se sirven («BQTSO01 → Prés de Vaux (12), Trey (D4)»): copia el identificador del lado donde subes. Un nombre que Ginko escribe de otra forma se encuentra igualmente («Pôle Temis» da «Temis»). **Probar la conexión** comprueba la clave y lee al momento cada parada y línea.

Más paradas que las tres del formulario (casa, trabajo…): **Añadir una parada** usa los mismos tres campos — parada, línea, dirección — y sigue hasta 20 paradas más. **Listar las paradas** muestra todas las paradas seguidas, numeradas; **Quitar una parada** usa ese número (o el nombre). Las paradas añadidas se guardan en la configuración de Gladys, así que siguen sus copias de seguridad.

## Uso

### Dispositivos

En la pestaña **Descubrir**, crea los dispositivos que quieras:

- **Ginko \<parada\>**: el próximo paso en texto («T2 → Hauts du Chazal · 3 min»), la espera del próximo paso y del siguiente (minutos), y el número de pasos anunciados que no paran en la parada («Non desservi», «Déviation»);
- **Ginko línea \<línea\>**: el tráfico en texto («Incidencia en curso: Manifestation») y el número de incidencias en curso.

Cuando el vehículo no está localizado, Ginko da el horario teórico: la integración lo indica («horario teórico»). De noche, sin ningún paso, las esperas conservan su último valor.

### Widgets del panel

![El widget Pasos de Ginko en Gare Viotte y el widget Tráfico Ginko de cinco líneas (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-ginko/main/docs/assets/widgets.es.png)

- **Pasos de Ginko**: los próximos pasos de una parada, en compacto: una fila por línea y destino con sus próximos pasos seguidos («1 · 9 · 27 min», «23:32», «Non desservi»), los horarios teóricos en gris. El ajuste **Trayectos mostrados** fija el número de filas. Elige una parada seguida, o escribe cualquier parada (y una línea) en los ajustes del widget. Con **Varias paradas**, un solo widget muestra varios dispositivos de parada: los dispositivos de una misma parada (uno por línea, por ejemplo) se reúnen bajo su nombre, con sus trayectos del más próximo al más lejano; para paradas distintas, cada fila empieza por su parada. El ajuste **Trayectos mostrados** vale entonces para cada parada, 10 filas como máximo en total.
- **Tráfico Ginko**: el estado de cada línea y después los avisos de Ginko; toca una tarjeta para ver el texto completo y el enlace a ginko.voyage. Las líneas seguidas, o las escritas en los ajustes.

### Escenas

Disparadores, una vez por cambio (la primera lectura de una parada o línea solo sirve de referencia):

- **Ginko: autobús o tranvía inminente**: un paso que para en una parada seguida llega dentro de 2, 3, 5, 10, 15 o 20 minutos.
- **Ginko: parada sin servicio**: el próximo paso de una línea ya no para en una parada seguida (desvío, obras).
- **Ginko: línea con incidencias**: una línea seguida pasa a tener incidencias o queda interrumpida.
- **Ginko: línea vuelve a la normalidad**: vuelve a circular.
- **Ginko: nuevo aviso de tráfico**: Ginko publica un aviso sobre una línea seguida (información, incidencia prevista o en curso).

Cada uno da una frase lista, `{{triggerEvent.data.summary}}`, y sus valores (línea, destino, hora, título, aviso…). Las acciones **Ginko: próximos pasos** y **Ginko: tráfico de una línea** devuelven el mismo tipo de valores, para ponerlos en un mensaje o comprobarlos en una condición.

Ejemplos:

- Cuando el T2 hacia Hauts du Chazal llegue a Gare Viotte dentro de 5 minutos → encender en verde la lámpara de la entrada.
- Cuando la línea L4 esté interrumpida → enviar el resumen y el enlace a tu teléfono.
- Cada día laborable a las 7:30 → leer los próximos pasos de tu parada y que los anuncie el altavoz de la cocina.

### Transporte

Solo cloud: los datos vienen de internet. Solo tu clave y los nombres de las paradas y líneas seguidas se envían a Ginko.

## Solución de problemas

- **«Ginko rechaza la clave de API»**: una clave temporal solo dura 24 horas; pide una clave permanente a Ginko.
- **«Desconocido para Ginko»**: usa **Buscar una parada** y copia el nombre exacto o un identificador; para una línea, su número como en los vehículos («L3», «Plan B»).
- **Ningún paso de noche**: la red duerme; la parada se lee cada 10 minutos hasta que se anuncia el primer paso.
- **«Non desservi» en todas partes**: una manifestación u obras: los vehículos no paran ahí, consulta los avisos de tráfico.
- **«La API de Ginko no responde»**: la integración lo vuelve a intentar en cada lectura; los últimos pasos se quedan en los widgets.
- **Para informar de un problema**: pulsa **Diagnóstico** y copia las líneas que empiezan por «Ginko diagnostic» de la pestaña Registros (la clave nunca aparece) en una issue de GitHub o una respuesta en el foro, con las versiones de Gladys y de la integración.
