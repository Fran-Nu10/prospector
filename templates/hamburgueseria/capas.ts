/*
 * Assets y coreografía de la burger del HeroExperience.
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE HAY QUE TOCAR PARA CAMBIAR LOS ASSETS O
 * AJUSTAR LA COREOGRAFÍA. `HeroExperience.tsx` no conoce ninguna ruta ni
 * ningún número: solo lee de acá.
 *
 * Las capas son assets de la PLANTILLA, no datos del cliente: la misma burger
 * genérica sirve para todos los prospectos del vertical (ver CLAUDE.md).
 *
 * La geometría del stack se expresa en un espacio de diseño de 1024px de
 * ancho —el ancho natural de los PNG— y se sirve como % del contenedor, así
 * la composición escala entera sin romperse. La coreografía, en cambio, se
 * expresa en unidades de viewport (vh/vw): el recorrido de una capa tiene que
 * medirse contra la pantalla, no contra la imagen.
 */

/**
 * Ancho del espacio de diseño = ancho del render explotado del que se
 * recortaron las capas. Cada capa se coloca centrada y a su ancho real
 * respecto de este espacio, así conservan sus proporciones entre sí (el bacon
 * sobresale de los panes, como en la foto).
 */
export const ANCHO_CAPAS = 1024;

/**
 * Alto de la caja del stack con las capas apiladas.
 *
 * No es un número elegido a ojo: es el alto del contenido de
 * `burger-armada.png` (1140×1132 dentro de su lienzo) llevado a este espacio
 * por su ancho. Que coincida es lo que hace que el crossfade entre la foto
 * armada y el stack no dé un salto de tamaño.
 */
export const ALTO_ARMADO = 1017;

export interface Capa {
  src: string;
  /** Ancho natural del recorte, en espacio de diseño. */
  ancho: number;
  /** Alto natural del recorte, en espacio de diseño. */
  alto: number;
  /** Posición dentro del stack apilado. */
  topArmado: number;
  z: number;
}

/* Orden visual, de arriba hacia abajo. Los `topArmado` reparten 716px de
 * solape en los cinco huecos (~143 cada uno): es lo que cierra la suma de los
 * seis altos (1733) contra el alto armado real (1017). */
export const CAPAS: Capa[] = [
  { src: "/hamburgueseria/capas-v2/capa-01-pan-superior.png", ancho: 826, alto: 363, topArmado: 0, z: 6 },
  { src: "/hamburgueseria/capas-v2/capa-02-bacon.png", ancho: 1006, alto: 288, topArmado: 220, z: 5 },
  { src: "/hamburgueseria/capas-v2/capa-03-smash-superior.png", ancho: 853, alto: 300, topArmado: 365, z: 4 },
  { src: "/hamburgueseria/capas-v2/capa-04-cebolla.png", ancho: 894, alto: 270, topArmado: 522, z: 3 },
  { src: "/hamburgueseria/capas-v2/capa-05-smash-inferior.png", ancho: 900, alto: 266, topArmado: 649, z: 2 },
  { src: "/hamburgueseria/capas-v2/capa-06-pan-inferior.png", ancho: 832, alto: 246, topArmado: 772, z: 1 },
];

/**
 * Imagen única de la burger ARMADA, para el estado inicial.
 *
 * `escalaRelativa` empata las siluetas del crossfade: el contenido de esta
 * foto ocupa 1140px de un lienzo de 1254, así que hay que agrandarla
 * 1254/1140 para que su burger mida lo mismo que el stack, que sí llena su
 * caja. Sin esto, la foto se ve más chica que las capas y el cambio salta.
 *
 * `src: null` desactiva la foto y deja que el estado inicial lo componga el
 * stack apilado; el crossfade queda sin efecto visible.
 */
export const BURGER_ARMADA: {
  src: string | null;
  ancho: number;
  alto: number;
  /** Ancho de la imagen armada respecto del ancho del stack, para empatar siluetas. */
  escalaRelativa: number;
} = {
  src: "/hamburgueseria/burger-armada.png",
  ancho: 1254,
  alto: 1254,
  escalaRelativa: 1254 / 1140,
};

/* ---------------------------------------------------------------------------
 * ESCENAS — progreso normalizado del track, 0→1.
 * ------------------------------------------------------------------------ */

export const ESCENAS = {
  /** 1 · Póster: la identidad del hero, quieta. */
  posterFin: 0.15,
  /** 2 · Despeje: se va el texto, la burger se centra y crece. */
  despejeFin: 0.28,
  /** Crossfade oculto entre la imagen armada y el stack de capas. */
  crossfadeInicio: 0.2,
  crossfadeFin: 0.3,
  /** 3 · Apertura: las capas se separan. */
  aperturaFin: 0.58,
  /** 4 · Acercamiento: la cámara entra entre las capas. */
  acercamientoFin: 0.82,
  /** 5 · Atravesar: las capas salen del viewport. */
  atravesarFin: 0.94,
} as const;

/* ---------------------------------------------------------------------------
 * COREOGRAFÍA POR CAPA
 *
 * Cada capa tiene su propia ventana y su propio recorrido: una sola fórmula
 * genérica hace que las seis se muevan como un bloque, que es exactamente lo
 * que no queremos. Los panes abren primero y el centro último.
 *
 * OJO con las unidades: los `vh` se aplican DENTRO del wrapper escalado, así
 * que el recorrido en pantalla queda multiplicado por la escala del momento.
 * Es deliberado —es lo que produce la sensación de cámara entrando— pero
 * significa que estos números son el destino nominal, no el aparente.
 * ------------------------------------------------------------------------ */

export interface CoreografiaCapa {
  /** Tramo del progreso en que esta capa se separa. */
  apertura: readonly [number, number];
  /** Destino vertical de la apertura, en vh (desktop). */
  separacionVh: number;
  /** Deriva horizontal durante el acercamiento, en vw (desktop). */
  derivaVw: number;
  /** Escala propia extra en el acercamiento: las de los extremos, más cerca. */
  escalaCercania: number;
  /** Destino vertical al salir del viewport, en vh (desktop). */
  salidaVh: number;
}

/*
 * OJO con `separacionVh`: es un desplazamiento RELATIVO a la posición apilada
 * de cada capa, no una posición absoluta en pantalla. Las capas ya arrancan
 * repartidas a lo largo del stack (±150px del centro en desktop), así que el
 * recorrido se suma a ese offset. Los ±38vh del planteo original mandaban los
 * dos panes fuera de cuadro justo al cerrar la apertura —el momento en que el
 * despiece tiene que leerse entero—; medido a 1440×900, los extremos entran
 * con ±30vh. La escena 4 los saca de cuadro después, que ahí sí corresponde.
 */
export const COREOGRAFIA: CoreografiaCapa[] = [
  { apertura: [0.28, 0.5], separacionVh: -30, derivaVw: -3.0, escalaCercania: 1.1, salidaVh: -110 },
  { apertura: [0.3, 0.52], separacionVh: -20, derivaVw: 2.2, escalaCercania: 1.04, salidaVh: -85 },
  { apertura: [0.32, 0.54], separacionVh: -8, derivaVw: -1.6, escalaCercania: 1.0, salidaVh: -65 },
  { apertura: [0.32, 0.54], separacionVh: 7, derivaVw: 1.8, escalaCercania: 1.0, salidaVh: 65 },
  { apertura: [0.3, 0.52], separacionVh: 19, derivaVw: -2.6, escalaCercania: 1.04, salidaVh: 85 },
  { apertura: [0.28, 0.5], separacionVh: 30, derivaVw: 3.4, escalaCercania: 1.1, salidaVh: 110 },
];

/* ---------------------------------------------------------------------------
 * ESCALA DEL CONJUNTO
 * ------------------------------------------------------------------------ */

/** Tiempos de los keyframes de escala (mismos para desktop y mobile). */
export const TIEMPOS_ESCALA = [
  0,
  ESCENAS.posterFin,
  ESCENAS.despejeFin,
  ESCENAS.aperturaFin,
  ESCENAS.acercamientoFin,
  ESCENAS.atravesarFin,
] as const;

export const ESCALA_DESKTOP = [0.75, 0.75, 0.95, 1.15, 2.25, 3.2];

/** En una pantalla angosta el mismo zoom marea y pixela: techo más bajo. */
export const ESCALA_MOBILE = [0.75, 0.75, 0.95, 1.05, 1.65, 2.3];

/** Inclinación del conjunto en el acercamiento, en grados. Mobile: sin 3D. */
export const INCLINACION_DESKTOP = 4;

/* ---------------------------------------------------------------------------
 * AJUSTES MOBILE (por debajo de `lg`)
 * ------------------------------------------------------------------------ */

export const MOBILE = {
  /** La separación vertical baja al 55% del recorrido desktop. */
  factorSeparacion: 0.55,
  /** Tope de deriva horizontal: 2vw sobre un máximo desktop de 4vw. */
  factorDeriva: 0.5,
  /**
   * La salida se acorta bastante más que el resto. No es sólo que la pantalla
   * sea más chica: en mobile no hay anticipación del menú, así que la salida
   * se estira hasta el final del track (ver `finSalida` en HeroExperience) y
   * con el recorrido de desktop las capas despejaban el viewport cerca de 0.93
   * y dejaban un tramo de negro antes de soltarse el sticky. Con este valor
   * la última capa termina de cruzar el borde prácticamente en 1.
   */
  factorSalida: 0.45,
} as const;

/* ---------------------------------------------------------------------------
 * GEOMETRÍA EN PANTALLA
 * ------------------------------------------------------------------------ */

/**
 * Ancho del conjunto. El tope en `svh` es lo que evita que la burger se coma
 * el alto útil en pantallas anchas y bajas, donde el `vw` solo se desborda.
 */
export const ANCHO_BURGER = "min(60vw, 41svh)";

/**
 * Alto de la nav sticky, que se superpone al viewport fijo del hero.
 *
 * El pin va a `top-0` —tiene que ocupar la pantalla entera para que la burger
 * pueda salirse por los cuatro bordes— así que la nav le pisa la franja
 * superior. Componer contra `inset-0` dejaba el tagline debajo de la barra y
 * el nombre recortado. Todo lo que es CONTENIDO arranca por debajo de esta
 * altura; la burger sigue usando la pantalla completa.
 */
export const ALTO_NAV = 69;
