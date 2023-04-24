import { endsWith } from "../helpers/string";
import { LayoutService } from "../layout-service";
import { LayoutPriority, View } from "../split-view";

export interface Layout {
  getPreferredSize: () => number | undefined;
}

export class PixelLayout implements Layout {
  private size: number;

  constructor(size: number) {
    this.size = size;
  }

  public getPreferredSize() {
    return this.size;
  }
}

export class ProportionLayout implements Layout {
  private proportion: number;
  private layoutService: LayoutService;

  constructor(proportion: number, layoutService: LayoutService) {
    this.proportion = proportion;
    this.layoutService = layoutService;
  }

  public getPreferredSize() {
    return this.proportion * this.layoutService.getSize();
  }
}

export class NullLayout implements Layout {
  public getPreferredSize() {
    return undefined;
  }
}

export interface PaneViewOptions {
  element: HTMLElement;
  minimumSize?: number;
  maximumSize?: number;
  priority?: LayoutPriority;
  preferredSize?: number | string;
  snap?: boolean;
}

export class PaneView implements View {
  private _minimumSize: number = 0;
  private _maximumSize: number = Number.POSITIVE_INFINITY;

  readonly element: HTMLElement;
  private _priority?: LayoutPriority | undefined;
  private _snap: boolean = false;

  private layoutService: LayoutService;
  private layoutStrategy: Layout;

  get preferredSize(): number | undefined {
    return this.layoutStrategy.getPreferredSize();
  }

  set preferredSize(preferredSize: number | string | undefined) {
    if (typeof preferredSize === "number") {
      this.layoutStrategy = new PixelLayout(preferredSize);
    } else if (typeof preferredSize === "string") {
      const trimmedPreferredSize = preferredSize.trim();

      if (endsWith(trimmedPreferredSize, "%")) {
        const proportion = Number(trimmedPreferredSize.slice(0, -1)) / 100;

        this.layoutStrategy = new ProportionLayout(
          proportion,
          this.layoutService
        );
      } else if (endsWith(trimmedPreferredSize, "px")) {
        const pixels = Number(trimmedPreferredSize.slice(0, -2)) / 100;

        this.layoutStrategy = new PixelLayout(pixels);
      } else if (typeof Number.parseFloat(trimmedPreferredSize) === "number") {
        const number = Number.parseFloat(trimmedPreferredSize);

        this.layoutStrategy = new PixelLayout(number);
      } else {
        this.layoutStrategy = new NullLayout();
      }
    } else {
      this.layoutStrategy = new NullLayout();
    }
  }

  get priority() { return this._priority }
  set priority(priority: LayoutPriority | undefined) {
    this._priority = priority ?? LayoutPriority.Normal;
  }
  get snap() { return this._snap }
  set snap(snap: boolean|undefined) {
    this._snap = typeof snap === "boolean" ? snap : false;
  }
  get minimumSize(): number { return this._minimumSize }
  set minimumSize(minimumSize: number|undefined) {
      this._minimumSize = typeof minimumSize === "number" ? minimumSize : 30;
  }
  get maximumSize(): number { return this._maximumSize }
  set maximumSize(maximumSize: number|undefined) {
      this._maximumSize = typeof maximumSize === "number"
        ? maximumSize
        : Number.POSITIVE_INFINITY;
  }

  constructor(layoutService: LayoutService, options: PaneViewOptions) {
    this.layoutService = layoutService;
    this.element = options.element;

    this.minimumSize = options.minimumSize;
    this.maximumSize = options.maximumSize;

    if (typeof options.preferredSize === "number") {
      this.layoutStrategy = new PixelLayout(options.preferredSize);
    } else if (typeof options.preferredSize === "string") {
      const preferredSize = options.preferredSize.trim();

      if (endsWith(preferredSize, "%")) {
        const proportion = Number(preferredSize.slice(0, -1)) / 100;

        this.layoutStrategy = new ProportionLayout(
          proportion,
          this.layoutService
        );
      } else if (endsWith(preferredSize, "px")) {
        const pixels = Number(preferredSize.slice(0, -2)) / 100;

        this.layoutStrategy = new PixelLayout(pixels);
      } else if (typeof Number.parseFloat(preferredSize) === "number") {
        const number = Number.parseFloat(preferredSize);

        this.layoutStrategy = new PixelLayout(number);
      } else {
        this.layoutStrategy = new NullLayout();
      }
    } else {
      this.layoutStrategy = new NullLayout();
    }

    this.priority = options.priority;
    this.snap = options.snap;
  }

  layout(_size: number): void {}
}
