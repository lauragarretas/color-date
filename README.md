# Color Date

App para dos personas: cada una recibe un color aleatorio y tiene 24h (o hasta un
número de fotos fijado al empezar) para fotografiar cosas que se acerquen a ese
color. Al final se revelan los colores, la cuadrícula de fotos de cada uno y el
porcentaje de acierto.

Es una PWA en HTML/CSS/JS puro (sin build) que usa Supabase como backend
(base de datos + almacenamiento de fotos) para sincronizar los dos móviles.

## 1. Crear el proyecto de Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project** (plan gratuito
   es más que suficiente).
2. Cuando esté listo, abre **SQL Editor** → **New query**, pega el contenido
   de [`supabase/schema.sql`](supabase/schema.sql) y ejecútalo (▶ Run).
3. Ve a **Storage** → **New bucket**:
   - Nombre: `photos`
   - **Public bucket: ON** (así las imágenes se pueden mostrar directamente
     sin necesidad de firmar URLs)
4. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon public key**

## 2. Configurar la app

Abre [`config.js`](config.js) y sustituye los valores:

```js
window.COLOR_DATE_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-ANON-KEY",
};
```

## 3. Alojarla (necesario para PWA + cámara en el móvil)

Los navegadores móviles solo permiten instalar como PWA y acceder a la cámara
sobre HTTPS, así que necesitas alojar estos archivos estáticos en algún sitio.
La forma más rápida y gratuita es **GitHub Pages**:

1. Sube esta carpeta a un repositorio de GitHub.
2. En el repo: **Settings → Pages → Deploy from branch**, elige `main` y
   carpeta `/ (root)`.
3. En un par de minutos tendrás una URL tipo
   `https://tu-usuario.github.io/color-date/`.

(Netlify o Vercel funcionan igual de bien arrastrando la carpeta, si lo
prefieres.)

## 4. Instalarla en los dos móviles

1. Abre la URL en el navegador del móvil (Chrome/Safari).
2. Menú del navegador → **Añadir a pantalla de inicio / Instalar app**.
3. Ábrela como cualquier otra app.

## Cómo se juega

1. Cada uno escribe su nombre arriba del todo.
2. Uno de los dos pulsa **Crear partida**, elige el número de fotos y
   comparte el código de 8 caracteres que aparece.
3. El otro pulsa **Unirse a partida** e introduce el código.
4. Nada más crear o unirse, cada uno ve su propio color en grande (pantalla
   "Este es tu color") — igual para los dos. En cuanto ambos estáis dentro
   empieza la cuenta atrás de 24h. El color del otro se mantiene en secreto.
5. Vais añadiendo fotos (cámara o galería) que creáis que se acercan a
   vuestro color, hasta el límite elegido.
6. La partida se revela en cuanto **pasan las 24h** o **ambos llegáis al
   límite de fotos**, lo que ocurra antes. Ahí veis el nombre y color de cada
   uno, la cuadrícula de fotos, y el porcentaje de la foto que más se acercó
   al color de cada persona.
7. Desde el revelado podéis **copiar un enlace permanente** al resultado
   (para guardarlo en favoritos o mandarlo por WhatsApp — funciona aunque
   borres los datos del navegador) o **descargar una imagen** con el
   resumen para guardarla como recuerdo.

## Notas técnicas / limitaciones asumidas

- **Sin login**: la identidad de "quién soy en esta partida" se guarda en el
  propio móvil (`localStorage`); si borras datos del navegador pierdes el
  acceso a esa partida.
- **Seguridad por código, no por autenticación**: las tablas y el bucket son
  de lectura/escritura abiertas vía la `anon key`, protegidas solo por lo
  impredecible del código de partida (8 caracteres, ~1 entre mil millones).
  Válido para uso personal, no para datos realmente sensibles.
- **Puntuación**: el porcentaje de cada jugador es el de su **mejor foto**
  (la más cercana al color asignado), no la media. Se calcula comparando el
  color medio de la foto (reducida a 48×48 px) contra el color asignado en
  el espacio RGB.
- **Colores "encontrables"**: se sortean a partir de una paleta de ~14 colores
  base reconocibles (rojo, azul, verde, naranja, rosa, marrón, gris, etc.)
  con una variación aleatoria, para que nunca toque un tono imposible de
  encontrar en el mundo real. Los dos jugadores siempre reciben colores de
  familias distintas.
- El contador de 24h arranca en el momento en que **se une el segundo
  jugador** a la partida, no al crearla. Hasta entonces, quien la creó ve la
  pantalla de espera sin cuenta atrás.
- El enlace guardado (`?ver=CODIGO`) funciona en modo solo lectura: no hace
  falta haber jugado en ese navegador para verlo, basta con conocer el
  código de la partida (igual de "privado por oscuridad" que el resto de la
  app).
