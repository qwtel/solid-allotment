// import EventEmitter from "eventemitter3";
import debounce from "lodash.debounce";
import { TypedEventTarget } from "vendor/typed-event-target";

import { Disposable } from "../helpers/disposable";
import { isIOS, isMacintosh } from "../helpers/platform";
import styles from "./sash.module.css";

export interface SashOptions {
  /** Whether a sash is horizontal or vertical. */
  readonly orientation: Orientation;

  /** The width or height of a vertical or horizontal sash, respectively. */
  readonly size?: number;
}

export interface SashEvent {
  startX: number;
  currentX: number;
  startY: number;
  currentY: number;
}

export enum Orientation {
  Vertical = "VERTICAL",
  Horizontal = "HORIZONTAL",
}

export enum SashState {
  /** Disable any UI interaction. */
  Disabled = "DISABLED",

  /**
   * Allow dragging down or to the right, depending on the sash orientation.
   *
   * Some OSs allow customizing the mouse cursor differently whenever
   * some resizable component can't be any smaller, but can be larger.
   */
  Minimum = "MINIMUM",

  /**
   * Allow dragging up or to the left, depending on the sash orientation.
   *
   * Some OSs allow customizing the mouse cursor differently whenever
   * some resizable component can't be any larger, but can be smaller.
   */
  Maximum = "MAXIMUM",

  /** Enable dragging. */
  Enabled = "ENABLED",
}

let globalSize = isIOS ? 20 : 13;

const onDidChangeGlobalSize = new TypedEventTarget<{ 
  onDidChangeGlobalSize: CustomEvent<number>
}>();

export function setGlobalSashSize(size: number): void {
  globalSize = size;
  onDidChangeGlobalSize.dispatchEvent(new CustomEvent("onDidChangeGlobalSize", { detail: size }));
}

export interface SashLayoutProvider {}

/** A vertical sash layout provider provides position and height for a sash. */
export interface VerticalSashLayoutProvider extends SashLayoutProvider {
  getVerticalSashLeft?(sash: Sash): number;
  getVerticalSashRight?(sash: Sash): number;
  getVerticalSashTop?(sash: Sash): number;
  getVerticalSashHeight?(sash: Sash): number;
}

/** A horizontal sash layout provider provides position and width for a sash. */
export interface HorizontalSashLayoutProvider extends SashLayoutProvider {
  getHorizontalSashTop(sash: Sash): number;
  getHorizontalSashLeft?(sash: Sash): number;
  getHorizontalSashWidth?(sash: Sash): number;
}

/**
 * The {@link Sash} is the UI component which allows the user to resize other
 * components. It's usually an invisible horizontal or vertical line which, when
 * hovered, becomes highlighted and can be dragged along the perpendicular dimension
 * to its direction.
 */
export class Sash extends TypedEventTarget<{
  enablementChange: CustomEvent<SashState>
  start: CustomEvent<SashEvent>
  change: CustomEvent<SashEvent>
  end: CustomEvent<void>
  reset: CustomEvent<void>
}> implements Disposable {
  private el: HTMLElement;
  private layoutProvider: SashLayoutProvider;
  private orientation!: Orientation;
  private size: number;
  private hoverDelay = 300;
  private hoverDelayer = debounce(
    (el) => el.classList.add("sash-hover", styles.hover),
    this.hoverDelay
  );

  private _state: SashState = SashState.Enabled;
  get state(): SashState {
    return this._state;
  }

  /**
   * The state of a sash defines whether it can be interacted with by the user
   * as well as what mouse cursor to use, when hovered.
   */
  set state(state: SashState) {
    if (this._state === state) {
      return;
    }

    this.el.classList.toggle(styles.disabled, state === SashState.Disabled);
    this.el.classList.toggle("dash-disabled", state === SashState.Disabled);
    this.el.classList.toggle(styles.minimum, state === SashState.Minimum);
    this.el.classList.toggle("sash-minimum", state === SashState.Minimum);
    this.el.classList.toggle(styles.maximum, state === SashState.Maximum);
    this.el.classList.toggle("sash-maximum", state === SashState.Maximum);

    this._state = state;

    this.emit("enablementChange", state);
  }

  private emit<T = any>(type: string, detail?: T) {
    this.dispatchEvent(new CustomEvent<T>(type, { detail }))
  }

  /**
   * Create a new vertical sash.
   *
   * @param container A DOM node to append the sash to.
   * @param verticalLayoutProvider A vertical layout provider.
   * @param options The options.
   */
  constructor(
    container: HTMLElement,
    layoutProvider: VerticalSashLayoutProvider,
    options: Omit<SashOptions, 'orientation'> & { orientation: Orientation.Vertical }
  );

  /**
   * Create a new horizontal sash.
   *
   * @param container A DOM node to append the sash to.
   * @param horizontalLayoutProvider A horizontal layout provider.
   * @param options The options.
   */
  constructor(
    container: HTMLElement,
    layoutProvider: HorizontalSashLayoutProvider,
    options: Omit<SashOptions, 'orientation'> & { orientation: Orientation.Horizontal }
  );
  constructor(
    container: HTMLElement,
    layoutProvider: SashLayoutProvider,
    options: SashOptions
  ) {
    super();

    this.el = document.createElement("div");
    this.el.classList.add("sash", styles.sash);
    this.el.dataset.testid = "sash";
    container.append(this.el);

    if (isMacintosh) {
      this.el.classList.add("sash-mac", styles.mac);
    }

    this.el.addEventListener("pointerdown", this.onPointerStart);
    this.el.addEventListener("dblclick", this.onPointerDoublePress);
    this.el.addEventListener("mouseenter", this.onMouseEnter);
    this.el.addEventListener("mouseleave", this.onMouseLeave);

    if (typeof options.size === "number") {
      this.size = options.size;

      if (options.orientation === Orientation.Vertical) {
        this.el.style.width = `${this.size}px`;
      } else {
        this.el.style.height = `${this.size}px`;
      }
    } else {
      this.size = globalSize;

      onDidChangeGlobalSize.addEventListener("onDidChangeGlobalSize", ev => {
        this.size = ev.detail;
        this.layout();
      });
    }

    this.layoutProvider = layoutProvider;

    this.orientation = options.orientation ?? Orientation.Vertical;

    if (this.orientation === Orientation.Horizontal) {
      this.el.classList.add("sash-horizontal", styles.horizontal);
      this.el.classList.remove("sash-vertical", styles.vertical);
    } else {
      this.el.classList.remove("sash-horizontal", styles.horizontal);
      this.el.classList.add("sash-vertical", styles.vertical);
    }

    this.layout();
  }

  private onPointerStart = (event: PointerEvent) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const startX = event.pageX;
    const startY = event.pageY;

    const startEvent: SashEvent = {
      startX,
      currentX: startX,
      startY,
      currentY: startY,
    };

    this.el.classList.add("sash-active", styles.active);

    this.emit("start", startEvent);

    this.el.setPointerCapture(event.pointerId);

    let moveEvent: SashEvent | undefined;

    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();

      const noMoveEvent = !moveEvent;

      moveEvent = {
        startX,
        currentX: event.pageX,
        startY,
        currentY: event.pageY,
      };

      noMoveEvent && requestAnimationFrame(() => {
        if (moveEvent) {
          this.emit("change", moveEvent)
          moveEvent = undefined; 
        }
      });
    };

    const onPointerUp = (event: PointerEvent): void => {
      event.preventDefault();

      this.el.classList.remove("sash-active", styles.active);
      this.hoverDelayer.cancel();
      this.emit("end");

      this.el.releasePointerCapture(event.pointerId);

      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  private onPointerDoublePress = (): void => {
    this.emit("reset");
  };

  private onMouseEnter = (): void => {
    if (this.el.classList.contains(styles.active)) {
      this.hoverDelayer.cancel();
      this.el.classList.add("sash-hover", styles.hover);
    } else {
      this.hoverDelayer(this.el);
    }
  };

  private onMouseLeave = (): void => {
    this.hoverDelayer.cancel();
    this.el.classList.remove("sash-hover", styles.hover);
  };

  /**
   * Layout the sash. The sash will size and position itself
   * based on its provided {@link SashLayoutProvider layout provider}.
   */
  public layout(): void {
    if (this.orientation === Orientation.Vertical) {
      const verticalProvider = this
        .layoutProvider as VerticalSashLayoutProvider;

      if (verticalProvider.getVerticalSashRight) { // XXX: added by me
        this.el.style.right =
          verticalProvider.getVerticalSashRight(this) - this.size / 2 + "px";
      } else if (verticalProvider.getVerticalSashLeft) {
        this.el.style.left =
          verticalProvider.getVerticalSashLeft(this) - this.size / 2 + "px";
      }

      if (verticalProvider.getVerticalSashTop) {
        this.el.style.top = verticalProvider.getVerticalSashTop(this) + "px";
      }

      if (verticalProvider.getVerticalSashHeight) {
        this.el.style.height =
          verticalProvider.getVerticalSashHeight(this) + "px";
      }
    } else {
      const horizontalProvider = this
        .layoutProvider as HorizontalSashLayoutProvider;

      this.el.style.top =
        horizontalProvider.getHorizontalSashTop(this) - this.size / 2 + "px";

      if (horizontalProvider.getHorizontalSashLeft) {
        this.el.style.left =
          horizontalProvider.getHorizontalSashLeft(this) + "px";
      }

      if (horizontalProvider.getHorizontalSashWidth) {
        this.el.style.width =
          horizontalProvider.getHorizontalSashWidth(this) + "px";
      }
    }
  }
  
  public dispose(): void {
    this.el.removeEventListener("pointerdown", this.onPointerStart);
    this.el.removeEventListener("dblclick", this.onPointerDoublePress);
    this.el.removeEventListener("mouseenter", this.onMouseEnter);
    this.el.removeEventListener("mouseleave", () => this.onMouseLeave);

    this.el.remove();
  }
}
