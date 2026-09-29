"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

const DrawerContext = createContext<{
  toggle: () => void;
  close: () => void;
  open: boolean;
} | null>(null);

export function useDashboardDrawer() {
  return useContext(DrawerContext);
}

/** Same width as the page slide's reveal, so the rail stays lined up behind it. */
function drawerWidth(viewport: number) {
  return Math.min(300, Math.round(viewport * 0.78));
}

export function DashboardShell({
  rail,
  drawer,
  children,
}: {
  rail: ReactNode;
  drawer: ReactNode;
  children: ReactNode;
}) {
  const swiperRef = useRef<SwiperInstance | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(false);
  const parking = useRef(false);
  const gestured = useRef(false);
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  const parkClosed = useCallback((swiper: SwiperInstance) => {
    if (openRef.current) return;
    const drawer = drawerWidth(swiper.width);
    const parked = swiper.activeIndex === 1 && Math.abs(swiper.translate + drawer) < 1;
    if (parked) return;
    parking.current = true;
    swiper.slideTo(1, 0, false);
    parking.current = false;
  }, []);

  const sizeDrawer = useCallback((swiper: SwiperInstance) => {
    const ghost = swiper.slides[0] as HTMLElement | undefined;
    const page = swiper.slides[1] as HTMLElement | undefined;
    if (!ghost || !page || swiper.width <= 0) return;
    const drawer = drawerWidth(swiper.width);
    const ghostWidth = `${drawer}px`;
    const pageWidth = `${swiper.width}px`;
    swiper.el.parentElement?.style.setProperty("--drawer", `${drawer}px`);
    if (ghost.style.width !== ghostWidth || page.style.width !== pageWidth) {
      ghost.style.width = ghostWidth;
      page.style.width = pageWidth;
      swiper.update();
    }
    parkClosed(swiper);
  }, [parkClosed]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const apply = () => {
      const next = shell.clientWidth < 768;
      setNarrow(next);
      if (!next) {
        openRef.current = false;
        setOpen(false);
        setReady(false);
      }
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  const close = useCallback(() => {
    openRef.current = false;
    swiperRef.current?.slideTo(1, 320);
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    gestured.current = true;
    const next = swiper.activeIndex !== 0;
    openRef.current = next;
    swiper.slideTo(next ? 0 : 1, 320);
  }, []);

  return (
    <DrawerContext.Provider value={{ toggle, close, open }}>
      <div ref={shellRef} className="relative flex h-dvh w-full overflow-hidden bg-background text-fg">
        {rail}
        <div
          inert={!open}
          aria-hidden={open ? undefined : true}
          className={`absolute inset-y-0 left-0 z-0 h-full w-[min(300px,78vw)] md:hidden ${ready ? "" : "invisible"}`}
          style={{ width: "var(--drawer, min(300px, 78vw))" }}
        >
          {drawer}
        </div>
        {narrow ? (
          <Swiper
            className="dashboard-drawer pointer-events-none absolute inset-0 z-10 h-full [&_.swiper-slide]:h-full [&_.swiper-wrapper]:h-full"
            initialSlide={1}
            speed={320}
            threshold={16}
            touchAngle={40}
            longSwipesRatio={0.18}
            followFinger
            shortSwipes
            resistanceRatio={0.72}
            slidesPerView="auto"
            noSwiping
            noSwipingSelector="[data-canvas-surface], [data-canvas-surface] *"
            preventClicks={false}
            preventClicksPropagation={false}
            touchStartPreventDefault={false}
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
              sizeDrawer(swiper);
              parkClosed(swiper);
              setReady(true);
              requestAnimationFrame(() => {
                const live = swiperRef.current;
                if (!live || openRef.current) return;
                parkClosed(live);
                setOpen(false);
              });
            }}
            onResize={(swiper) => {
              sizeDrawer(swiper);
            }}
            onTouchStart={() => {
              gestured.current = true;
            }}
            onSlideChange={(swiper) => {
              if (parking.current) return;
              if (!gestured.current && swiper.activeIndex === 0) {
                parkClosed(swiper);
                openRef.current = false;
                setOpen(false);
                return;
              }
              const next = swiper.activeIndex === 0;
              openRef.current = next;
              setOpen(next);
            }}
          >
            <SwiperSlide className="bg-transparent" />
            <SwiperSlide className="pointer-events-auto h-full touch-pan-y">
              <div className={`relative flex h-dvh min-w-0 flex-col bg-background ${open ? "shadow-[-16px_0_36px_rgba(0,0,0,0.1)]" : ""}`}>
                <div inert={open} className="flex min-h-0 flex-1 flex-col">
                  {children}
                </div>
                {open ? (
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="absolute inset-0 z-30 cursor-default"
                    onClick={close}
                  />
                ) : null}
              </div>
            </SwiperSlide>
          </Swiper>
        ) : (
          <div className="relative z-10 flex min-w-0 flex-1 flex-col">{children}</div>
        )}
      </div>
    </DrawerContext.Provider>
  );
}
