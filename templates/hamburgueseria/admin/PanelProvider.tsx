"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  cerrarSesion,
  iniciarSesion,
  snapshotSesion,
  snapshotSesionServidor,
  suscribirSesion,
  type SesionAdmin,
} from "../../../web/lib/ecommerce/sesion";
import {
  sesionPuede,
  type AreaPanel,
} from "../../../web/lib/ecommerce/permisos";
import type { EcommerceRepositories } from "../../../web/lib/ecommerce/repositories";
import {
  obtenerEcommerce,
  suscribirEcommerce,
} from "../../../web/lib/ecommerce/service";
import {
  EcommerceError,
  type AdminRole,
  type Category,
  type DeliveryZone,
  type Order,
  type OrderStatus,
  type Product,
  type RestaurantOperationalSettings,
} from "../../../web/lib/ecommerce/types";
import { textoError } from "../ecommerce/copy";

/*
 * PANEL — la única puerta del panel al ecommerce.
 *
 * Ninguna pantalla administrativa toca `localStorage`, ni el proveedor demo, ni
 * el JSON del prospecto. Todas piden acá: la sesión, los pedidos y las
 * acciones. Cuando entre Supabase se cambian dos implementaciones —la sesión y
 * el repositorio— y este archivo sigue igual.
 *
 * LOS PEDIDOS SE RELEEN, NO SE PARCHEAN EN MEMORIA. Después de cada acción se
 * vuelve a pedir la lista al repositorio: es la misma verdad que ve el cliente
 * en su página, y evita que el panel se quede con una copia optimista que no
 * coincide con lo que quedó guardado.
 */

export interface Panel {
  sesion: SesionAdmin | null;
  /**
   * `false` durante el primer render.
   *
   * `useSyncExternalStore` devuelve el snapshot del SERVIDOR en la hidratación
   * —y en el servidor nunca hay sesión—, así que `sesion === null` no significa
   * "no hay sesión" hasta que esto es `true`. Sin este semáforo, el panel
   * redirigía al acceso, el acceso veía la sesión y redirigía de vuelta: un
   * rebote infinito entre las dos pantallas.
   */
  sesionResuelta: boolean;
  /** `false` hasta que se leyó la lista por primera vez en el navegador. */
  cargado: boolean;
  pedidos: Order[];
  entrar(role: AdminRole): void;
  salir(): void;
  cambiarEstado(
    id: string,
    destino: OrderStatus,
    opciones?: { reason?: string; estimatedMinutes?: number }
  ): Promise<boolean>;
  cobrar(id: string): Promise<boolean>;
  /**
   * ¿La sesión actual entra a esta área?
   *
   * Es la MISMA pregunta que decide si se pinta el enlace y si la pantalla se
   * renderiza. Ocultar el botón no es un permiso: por eso las dos cosas leen
   * de acá y no de un `role === "owner"` suelto en el JSX.
   */
  puede(area: AreaPanel): boolean;
  /** Catálogo COMPLETO —inactivos y archivados incluidos—: es el panel. */
  catalogo: CatalogoPanel;
  /**
   * Ejecuta una escritura contra el proveedor, traduce el error y vuelve a
   * leer. Es el único camino de escritura del panel: ninguna pantalla habla
   * con el repositorio por su cuenta, así que ninguna puede olvidarse de
   * refrescar ni de mostrar el error.
   *
   * Devuelve lo que devolvió la acción, o `null` si falló.
   */
  guardar<T>(
    accion: (repos: EcommerceRepositories) => Promise<T>
  ): Promise<T | null>;
  /** Último error de una acción, ya traducido. */
  error: string | null;
  limpiarError(): void;
}

export interface CatalogoPanel {
  /** `false` hasta la primera lectura en el navegador. */
  cargado: boolean;
  categorias: Category[];
  productos: Product[];
  zonas: DeliveryZone[];
  ajustes: RestaurantOperationalSettings | null;
}

const CATALOGO_VACIO: CatalogoPanel = {
  cargado: false,
  categorias: [],
  productos: [],
  zonas: [],
  ajustes: null,
};

const PanelContext = createContext<Panel | null>(null);

export function usePanel(): Panel | null {
  return useContext(PanelContext);
}

export default function PanelProvider({ children }: { children: React.ReactNode }) {
  const sesion = useSyncExternalStore(
    suscribirSesion,
    snapshotSesion,
    snapshotSesionServidor
  );

  const [sesionResuelta, setSesionResuelta] = useState(false);
  useEffect(() => setSesionResuelta(true), []);

  const [pedidos, setPedidos] = useState<Order[]>([]);
  const [cargado, setCargado] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoPanel>(CATALOGO_VACIO);
  const [error, setError] = useState<string | null>(null);

  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const releer = useCallback(() => {
    const { catalog, orders, settings } = obtenerEcommerce();
    orders
      .list()
      .then((lista) => {
        if (!vivo.current) return;
        setPedidos(lista);
        setCargado(true);
      })
      .catch(() => {
        if (vivo.current) setCargado(true);
      });

    /* El panel pide TODO: lo inactivo y lo archivado también. Un catálogo
       filtrado sería el de la tienda, y desde acá justamente hay que poder ver
       —y devolver a la vida— lo que está apagado. */
    Promise.all([
      catalog.listCategories({ includeInactive: true, includeArchived: true }),
      catalog.listProducts({ includeInactive: true, includeArchived: true }),
      settings.listDeliveryZones({ includeInactive: true, includeArchived: true }),
      settings.getSettings(),
    ])
      .then(([categorias, productos, zonas, ajustes]) => {
        if (!vivo.current) return;
        setCatalogo({ cargado: true, categorias, productos, zonas, ajustes });
      })
      .catch(() => {
        if (vivo.current) setCatalogo((c) => ({ ...c, cargado: true }));
      });
  }, []);

  /* Sin sesión no se leen pedidos. La suscripción se da de baja al desmontar y
     al salir: dejarla viva sería una fuga y, con Supabase, una conexión abierta
     de más. */
  useEffect(() => {
    if (!sesion) {
      setPedidos([]);
      setCargado(false);
      setCatalogo(CATALOGO_VACIO);
      return;
    }
    releer();
    return suscribirEcommerce(releer);
  }, [sesion, releer]);

  /* Aviso en el título cuando entra un pedido y la pestaña no está al frente.
     Sin sonido: un local con el panel abierto en la barra no necesita que la
     computadora le grite. */
  const nuevosPrevios = useRef<number | null>(null);
  const tituloOriginal = useRef<string | null>(null);
  useEffect(() => {
    if (!sesion) return;
    const nuevos = pedidos.filter((p) => p.status === "pending_confirmation").length;
    if (tituloOriginal.current === null) tituloOriginal.current = document.title;

    if (nuevosPrevios.current !== null && nuevos > nuevosPrevios.current) {
      document.title = `(${nuevos}) Nuevo pedido`;
    } else if (nuevos === 0) {
      document.title = tituloOriginal.current;
    }
    nuevosPrevios.current = nuevos;
  }, [pedidos, sesion]);

  useEffect(() => {
    const alVolver = () => {
      if (tituloOriginal.current) document.title = tituloOriginal.current;
    };
    window.addEventListener("focus", alVolver);
    return () => window.removeEventListener("focus", alVolver);
  }, []);

  const ejecutar = useCallback(
    async (accion: () => Promise<unknown>): Promise<boolean> => {
      setError(null);
      try {
        await accion();
        releer();
        return true;
      } catch (e) {
        setError(
          e instanceof EcommerceError
            ? textoError(e.code, e.message)
            : "No pudimos guardar el cambio. Probá de nuevo."
        );
        /* Se relee igual: si falló porque otra pestaña ya hizo la transición,
           la lista tiene que mostrar el estado real, no el que el panel creía. */
        releer();
        return false;
      }
    },
    [releer]
  );

  const guardar = useCallback<Panel["guardar"]>(
    async (accion) => {
      setError(null);
      try {
        const resultado = await accion(obtenerEcommerce());
        releer();
        return resultado;
      } catch (e) {
        setError(
          e instanceof EcommerceError
            ? textoError(e.code, e.message)
            : "No pudimos guardar el cambio. Probá de nuevo."
        );
        /* Igual se relee: si el cambio falló porque otra pestaña ya lo hizo, la
           pantalla tiene que mostrar lo que quedó guardado, no lo que creía. */
        releer();
        return null;
      }
    },
    [releer]
  );

  const cambiarEstado = useCallback<Panel["cambiarEstado"]>(
    (id, destino, opciones) =>
      ejecutar(() =>
        obtenerEcommerce().orders.changeStatus(id, destino, {
          ...opciones,
          actorRole: sesion?.role,
        })
      ),
    [ejecutar, sesion]
  );

  const cobrar = useCallback<Panel["cobrar"]>(
    (id) =>
      ejecutar(() =>
        obtenerEcommerce().orders.markPaid(id, { actorRole: sesion?.role })
      ),
    [ejecutar, sesion]
  );

  const valor: Panel = {
    sesion,
    sesionResuelta,
    cargado,
    pedidos,
    entrar: iniciarSesion,
    salir: cerrarSesion,
    cambiarEstado,
    cobrar,
    puede: (area) => sesionPuede(sesion, area),
    catalogo,
    guardar,
    error,
    limpiarError: () => setError(null),
  };

  return <PanelContext.Provider value={valor}>{children}</PanelContext.Provider>;
}
