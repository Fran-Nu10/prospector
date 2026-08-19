"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  agregarAlCarrito,
  cambiarCantidad as cambiarCantidadStore,
  quitarDelCarrito,
  snapshotCarrito,
  snapshotCarritoServidor,
  suscribirCarrito,
  vaciarCarrito,
} from "../../../web/lib/ecommerce/carrito";
import { resolverCarrito, type CarritoResuelto } from "../../../web/lib/ecommerce/domain";
import {
  obtenerEcommerce,
  suscribirEcommerce,
} from "../../../web/lib/ecommerce/service";
import type { Product } from "../../../web/lib/ecommerce/types";
import {
  seccionesDeCatalogo,
  type FuenteCatalogo,
  type ProductoVista,
  type SeccionVista,
} from "../../../web/lib/ecommerce/vistas";

/*
 * TIENDA — el único punto donde la plantilla toca el ecommerce.
 *
 * Qué hace, y por qué está armado así:
 *
 * · EL CATÁLOGO ENTRA POR EL SERVIDOR. La página lee el catálogo con el
 *   repositorio y lo pasa como prop, así el HTML sale completo y el menú no
 *   parpadea. En el cliente se vuelve a leer —ahí sí aparece lo que el dueño
 *   tenga guardado— y se refresca solo cuando el proveedor avisa que cambió.
 *
 * · EL CARRITO NO VIVE EN UN COMPONENTE. Es un store externo leído con
 *   `useSyncExternalStore`: sobrevive a cualquier remontaje, se sincroniza
 *   entre pestañas y en el servidor arranca vacío sin desincronizar la
 *   hidratación.
 *
 * · ACÁ NO SE CALCULA DINERO. El subtotal y los precios por línea salen de
 *   `resolverCarrito`, que es dominio compartido. Si mañana el precio se
 *   calcula distinto, se cambia en un solo lugar y esto no se entera.
 */

export interface Tienda {
  /** `false` = carta: se muestra, no se vende (prospecto sin ecommerce). */
  interactivo: boolean;
  secciones: SeccionVista[];
  carrito: CarritoResuelto;
  /** Producto abierto en la hoja de detalle. */
  productoAbierto: ProductoVista | null;
  carritoAbierto: boolean;
  /** Última línea agregada: dispara el feedback visual y se limpia sola. */
  ultimoAgregado: string | null;
  abrirProducto(producto: ProductoVista): void;
  cerrarProducto(): void;
  abrirCarrito(): void;
  cerrarCarrito(): void;
  agregar(
    producto: ProductoVista,
    cantidad: number,
    optionIds: string[],
    notas?: string
  ): void;
  cambiarCantidad(lineId: string, cantidad: number): void;
  quitar(lineId: string): void;
  vaciar(): void;
}

const CarritoVacio: CarritoResuelto = {
  lineas: [],
  subtotalCents: 0,
  unidades: 0,
  hayProblemas: false,
  hayCambiosDePrecio: false,
};

const TiendaContext = createContext<Tienda | null>(null);

/** Devuelve `null` fuera de la tienda: una sección puede no estar envuelta. */
export function useTienda(): Tienda | null {
  return useContext(TiendaContext);
}

export default function TiendaProvider({
  fuente,
  children,
}: {
  fuente: FuenteCatalogo;
  children: React.ReactNode;
}) {
  const interactivo = fuente.modo === "ecommerce";

  /* El estado arranca con lo que trajo el servidor: el primer render del
     cliente pinta exactamente lo mismo y no hay desajuste de hidratación. */
  const [categorias, setCategorias] = useState(
    fuente.modo === "ecommerce" ? fuente.categorias : []
  );
  const [productos, setProductos] = useState<Product[]>(
    fuente.modo === "ecommerce" ? fuente.productos : []
  );

  /* Relectura en el cliente + refresco cuando el proveedor avisa. Con el
     proveedor demo eso pasa al escribir; con Supabase lo hará Realtime. */
  useEffect(() => {
    if (!interactivo) return;
    let vivo = true;
    const { catalog } = obtenerEcommerce();
    const cargar = () => {
      Promise.all([
        catalog.listCategories(),
        catalog.listProducts({ includeInactive: true }),
      ]).then(([cats, prods]) => {
        if (!vivo) return;
        setCategorias(cats.map((c) => ({ id: c.id, name: c.name })));
        setProductos(prods);
      });
    };
    cargar();
    const baja = suscribirEcommerce(cargar);
    return () => {
      vivo = false;
      baja();
    };
  }, [interactivo]);

  const secciones = useMemo(
    () =>
      fuente.modo === "carta"
        ? fuente.secciones
        : seccionesDeCatalogo(categorias, productos, new Date(), fuente.timezone),
    [fuente, categorias, productos]
  );

  const estadoCarrito = useSyncExternalStore(
    suscribirCarrito,
    snapshotCarrito,
    snapshotCarritoServidor
  );

  const carrito = useMemo(
    () =>
      interactivo
        ? resolverCarrito(estadoCarrito.items, productos)
        : CarritoVacio,
    [estadoCarrito, productos, interactivo]
  );

  const [productoAbierto, setProductoAbierto] = useState<ProductoVista | null>(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [ultimoAgregado, setUltimoAgregado] = useState<string | null>(null);

  /* El destello de "agregado" se apaga solo: es feedback, no estado. */
  useEffect(() => {
    if (!ultimoAgregado) return;
    const t = setTimeout(() => setUltimoAgregado(null), 2200);
    return () => clearTimeout(t);
  }, [ultimoAgregado]);

  const agregar = useCallback<Tienda["agregar"]>(
    (producto, cantidad, optionIds, notas) => {
      /* Sin id no hay catálogo detrás; sin precio no hay nada que cobrar. Los
         dos casos ya están bloqueados en la UI: esto es el segundo cerrojo. */
      if (!producto.id || producto.priceCents === null || !producto.comprable) return;
      agregarAlCarrito({
        productId: producto.id,
        quantity: cantidad,
        optionIds,
        notes: notas,
        vista: {
          nombre: producto.name,
          /* Snapshot de PRESENTACIÓN: se guarda el precio que la persona vio
             para poder avisarle si cambia, nunca para cobrárselo. */
          precioUnitarioCents: producto.priceCents,
          imagenUrl: producto.imageUrl,
        },
      });
      setUltimoAgregado(producto.id);
    },
    []
  );

  const valor = useMemo<Tienda>(
    () => ({
      interactivo,
      secciones,
      carrito,
      productoAbierto,
      carritoAbierto,
      ultimoAgregado,
      abrirProducto: setProductoAbierto,
      cerrarProducto: () => setProductoAbierto(null),
      abrirCarrito: () => setCarritoAbierto(true),
      cerrarCarrito: () => setCarritoAbierto(false),
      agregar,
      cambiarCantidad: cambiarCantidadStore,
      quitar: quitarDelCarrito,
      vaciar: vaciarCarrito,
    }),
    [
      interactivo,
      secciones,
      carrito,
      productoAbierto,
      carritoAbierto,
      ultimoAgregado,
      agregar,
    ]
  );

  return <TiendaContext.Provider value={valor}>{children}</TiendaContext.Provider>;
}
