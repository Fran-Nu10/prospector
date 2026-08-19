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
  obtenerEcommerce,
  suscribirEcommerce,
} from "../../../web/lib/ecommerce/service";
import {
  EcommerceError,
  type AdminRole,
  type Order,
  type OrderStatus,
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
  /** Último error de una acción, ya traducido. */
  error: string | null;
  limpiarError(): void;
}

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
  const [error, setError] = useState<string | null>(null);

  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  const releer = useCallback(() => {
    obtenerEcommerce()
      .orders.list()
      .then((lista) => {
        if (!vivo.current) return;
        setPedidos(lista);
        setCargado(true);
      })
      .catch(() => {
        if (vivo.current) setCargado(true);
      });
  }, []);

  /* Sin sesión no se leen pedidos. La suscripción se da de baja al desmontar y
     al salir: dejarla viva sería una fuga y, con Supabase, una conexión abierta
     de más. */
  useEffect(() => {
    if (!sesion) {
      setPedidos([]);
      setCargado(false);
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
    error,
    limpiarError: () => setError(null),
  };

  return <PanelContext.Provider value={valor}>{children}</PanelContext.Provider>;
}
