import classNames from "classnames";
import clamp from "lodash.clamp";
import isEqual from "lodash.isequal";
import { Component, Ref,children, createEffect, createMemo, createRenderEffect, createSignal, JSX, onMount, For } from "solid-js";
import { createResizeObserver } from "@solid-primitives/resize-observer";

import styles from "./allotment.module.css";
import { isIOS } from "./helpers/platform";
import { LayoutService } from "./layout-service";
import { PaneView } from "./pane-view";
import { Orientation, setGlobalSashSize } from "./sash";
import {
  LayoutPriority,
  Sizing,
  SplitView,
  SplitViewOptions,
} from "./split-view";

function isPane(item: HTMLElement) {
  return item.dataset['pane'] != null;
}

function isPaneProps(props: AllotmentProps | PaneProps): props is PaneProps {
  return (
    (props as PaneProps).minSize !== undefined ||
    (props as PaneProps).maxSize !== undefined ||
    (props as PaneProps).preferredSize !== undefined ||
    (props as PaneProps).priority !== undefined ||
    (props as PaneProps).visible !== undefined
  );
}

export interface CommonProps {
  /** Sets a className attribute on the outer component */
  class?: string;
  /** Maximum size of each element */
  maxSize?: number;
  /** Minimum size of each element */
  minSize?: number;
  /** Enable snap to zero size */
  snap?: boolean;
}

export type PaneProps = {
  ref: Ref<HTMLDivElement>,

  children: JSX.Element;
  /**
   * Preferred size of this pane. Allotment will attempt to use this size when adding this pane (including on initial mount) as well as when a user double clicks a sash, or the `reset` method is called on the Allotment instance.
   * @remarks The size can either be a number or a string. If it is a number it will be interpreted as a number of pixels. If it is a string it should end in either "px" or "%". If it ends in "px" it will be interpreted as a number of pixels, e.g. "120px". If it ends in "%" it will be interpreted as a percentage of the size of the Allotment component, e.g. "50%".
   */
  preferredSize?: number | string;
  /**
   * The priority of the pane when the layout algorithm runs. Panes with higher priority will be resized first.
   * @remarks Only used when `proportionalLayout` is false.
   */
  priority?: LayoutPriority;
  /** Whether the pane should be visible */
  visible?: boolean;
} & CommonProps;

/**
 * Pane component.
 */
export const Pane = (props: PaneProps) => {
    return (
      <div
        ref={props.ref}
        data-pane=""
        class={classNames(
          "split-view-view",
          styles.splitViewView,
          props.class
        )}
      >
        {props.children}
      </div>
    );
  }

Pane.displayName = "Allotment.Pane";

export type AllotmentHandle = {
  reset: () => void;
  resize: (sizes: number[]) => void;
};

export type AllotmentProps = {
  children: JSX.Element;
  /** Initial size of each element */
  defaultSizes?: number[];
  /** Resize each view proportionally when resizing container */
  proportionalLayout?: boolean;
  /** Whether to render a separator between panes */
  separator?: boolean;
  /**
   * Initial size of each element
   * @deprecated Use {@link AllotmentProps.defaultSizes defaultSizes} instead
   */
  sizes?: number[];
  /** Direction to split */
  vertical?: boolean;
  /** Callback on drag */
  onChange?: (sizes: number[]) => void;
  /** Callback on reset */
  onReset?: () => void;
  /** Callback on visibility change */
  onVisibleChange?: (index: number, visible: boolean) => void;
} & CommonProps;

/**
 * React split-pane component.
 */
const Allotment = (props: AllotmentProps) => {
    let containerRef: HTMLDivElement;
    let previousNodes: HTMLElement[] = [];
    let splitViewPropsRef = new Map<Node, PaneProps>();
    let splitViewRef: SplitView | null = null;
    let splitViewViewRef = new Map<Node, HTMLElement>();
    let layoutService = new LayoutService();
    let views: PaneView[] = [];

    const [dimensionsInitialized, setDimensionsInitialized] = createSignal(false);

    if (process.env.NODE_ENV !== "production" && props.sizes) {
      console.warn(
        `Prop sizes is deprecated. Please use defaultSizes instead.`
      );
    }

    const resolved = children(() => props.children);
    const childrenArray = createMemo(
      () => resolved.toArray().filter(x => x instanceof HTMLElement) as HTMLElement[],
    );

    const resizeToPreferredSize = (index: number): boolean => {
      const view = views?.[index];

      if (typeof view?.preferredSize !== "number") {
        return false;
      }

      splitViewRef?.resizeView(index, Math.round(view.preferredSize));

      return true;
    }

    // onMount(() => Object.assign(containerRef, {
    //   reset: () => {
    //     if (props.onReset) {
    //       props.onReset();
    //     } else {
    //       splitViewRef?.distributeViewSizes();

    //       for (let index = 0; index < views.length; index++) {
    //         resizeToPreferredSize(index);
    //       }
    //     }
    //   },
    //   resize: (sizes: number[]) => {
    //     splitViewRef?.resizeViews(sizes);
    //   },
    // }));

    onMount(() => {
      let initializeSizes = true;

      if (
        props.defaultSizes &&
        splitViewViewRef.size !== props.defaultSizes.length
      ) {
        initializeSizes = false;

        console.warn(
          `Expected ${props.defaultSizes.length} children based on defaultSizes but found ${splitViewViewRef.size}`
        );
      }

      if (initializeSizes && props.defaultSizes) {
        // previousKeys = childrenArray().map(
        //   (child) => child.key as string
        // );
        previousNodes = childrenArray();
      }

      const options: SplitViewOptions = {
        orientation: props.vertical ? Orientation.Vertical : Orientation.Horizontal,
        proportionalLayout: props.proportionalLayout,
        ...(initializeSizes &&
          props.defaultSizes && {
            descriptor: {
              size: props.defaultSizes.reduce((a, b) => a + b, 0),
              views: props.defaultSizes.map((size, index) => {
                const svProps = splitViewPropsRef.get(previousNodes[index]);
                const view = new PaneView(layoutService, {
                  element: document.createElement("div"),
                  minimumSize: svProps?.minSize ?? props.minSize,
                  maximumSize: svProps?.maxSize ?? props.maxSize,
                  priority: svProps?.priority ?? LayoutPriority.Normal,
                  ...(svProps?.preferredSize && {
                    preferredSize: svProps?.preferredSize,
                  }),
                  snap: svProps?.snap ?? props.snap,
                });

                views.push(view);

                return {
                  container: [...splitViewViewRef.values()][index],
                  size: size,
                  view: view,
                };
              }),
            },
          }),
      };

      splitViewRef = new SplitView(
        containerRef,
        options,
        props.onChange
      );

      splitViewRef.addEventListener("sashchange", () => {
        if (props.onVisibleChange && splitViewRef) {
          const nodes = childrenArray();

          for (let index = 0; index < nodes.length; index++) {
            const paneProps = splitViewPropsRef.get(nodes[index]);

            if (paneProps?.visible !== undefined) {
              if (paneProps.visible !== splitViewRef.isViewVisible(index)) {
                props.onVisibleChange(
                  index,
                  splitViewRef.isViewVisible(index)
                );
              }
            }
          }
        }
      });

      splitViewRef.addEventListener("sashreset", ev => {
        const index = (ev as CustomEvent<number>).detail;
        if (props.onReset) {
          props.onReset();
        } else {
          if (resizeToPreferredSize(index)) {
            return;
          }

          if (resizeToPreferredSize(index + 1)) {
            return;
          }

          splitViewRef?.distributeViewSizes();
        }
      });

      const that = splitViewRef;

      return () => {
        that.dispose();
      };
    });

    /**
     * Add, remove or update views as children change
     */
     createRenderEffect(() => {
      if (dimensionsInitialized()) {
        const nodes = childrenArray();
        const panes = [...previousNodes];

        const enter = nodes.filter(node => !previousNodes.includes(node));
        const update = nodes.filter(node => previousNodes.includes(node));
        const exit = previousNodes.map(node => !nodes.includes(node));

        for (let index = exit.length - 1; index >= 0; index--) {
          if (exit[index]) {
            splitViewRef?.removeView(index);
            panes.splice(index, 1);
            views.splice(index, 1);
          }
        }

        for (const enterNode of enter) {
          const svProps = splitViewPropsRef.get(enterNode);

          const view = new PaneView(layoutService, {
            element: document.createElement("div"),
            minimumSize: svProps?.minSize ?? props.minSize,
            maximumSize: svProps?.maxSize ?? props.maxSize,
            priority: svProps?.priority ?? LayoutPriority.Normal,
            ...(svProps?.preferredSize && {
              preferredSize: svProps?.preferredSize,
            }),
            snap: svProps?.snap ?? props.snap,
          });

          splitViewRef?.addView(
            splitViewViewRef.get(enterNode)!,
            view,
            Sizing.Distribute,
            nodes.findIndex(node => node === enterNode)
          );

          panes.splice(
            nodes.findIndex(node => node === enterNode),
            0,
            enterNode
          );

          views.splice(
            nodes.findIndex(node => node === enterNode),
            0,
            view
          );
        }

        // Move panes if order has changed
        while (!isEqual(nodes, panes)) {
          for (const [i, node] of nodes.entries()) {
            const index = panes.findIndex((pane) => pane === node);

            if (index !== i) {
              splitViewRef?.moveView(
                splitViewViewRef.get(node) as HTMLElement,
                index,
                i
              );

              const tempNode = panes[index];
              panes.splice(index, 1);
              panes.splice(i, 0, tempNode);

              break;
            }
          }
        }

        for (const enterNode of enter) {
          const index = nodes.findIndex(node => node === enterNode);

          const preferredSize = views[index].preferredSize;

          if (preferredSize !== undefined) {
            splitViewRef?.resizeView(index, preferredSize);
          }
        }

        for (const updateNode of [...enter, ...update]) {
          const svProps = splitViewPropsRef.get(updateNode);
          const index = nodes.findIndex(node => node === updateNode);

          if (svProps && isPaneProps(svProps)) {
            if (svProps.visible !== undefined) {
              if (
                splitViewRef?.isViewVisible(index) !== svProps.visible
              ) {
                splitViewRef?.setViewVisible(index, svProps.visible);
              }
            }
          }
        }

        for (const updateNode of update) {
          const svProps = splitViewPropsRef.get(updateNode);
          const index = nodes.findIndex(node => node === updateNode);

          if (svProps && isPaneProps(svProps)) {
            if (
              svProps.preferredSize !== undefined &&
              views[index].preferredSize !== svProps.preferredSize
            ) {
              views[index].preferredSize = svProps.preferredSize;
            }

            let sizeChanged = false;

            if (
              svProps.minSize !== undefined &&
              views[index].minimumSize !== svProps.minSize
            ) {
              views[index].minimumSize = svProps.minSize;
              sizeChanged = true;
            }

            if (
              svProps.maxSize !== undefined &&
              views[index].maximumSize !== svProps.maxSize
            ) {
              views[index].maximumSize = svProps.maxSize;
              sizeChanged = true;
            }

            if (sizeChanged) {
              splitViewRef?.layout();
            }
          }
        }

        if (enter.length > 0 || exit.length > 0) {
          previousNodes = nodes;
        }
      }
    });

    createEffect(() => {
      if (splitViewRef) {
        splitViewRef.onDidChange = props.onChange;
      }
    });

    onMount(() => {
      createResizeObserver(containerRef, ({ width, height }) => {
        if (width && height) {
          splitViewRef?.layout(props.vertical ? height : width);
          layoutService.setSize(props.vertical ? height : width);
          setDimensionsInitialized(true);
        }
      });
    });

    onMount(() => {
      if (isIOS) {
        setSashSize(20);
      }
    });

    return (
      <div
        ref={containerRef!}
        class={classNames(
          "split-view",
          props.vertical ? "split-view-vertical" : "split-view-horizontal",
          { "split-view-separator-border": props.separator },
          styles.splitView,
          props.vertical ? styles.vertical : styles.horizontal,
          { [styles.separatorBorder]: props.separator },
          props.class
        )}
      >
        <div
          class={classNames(
            "split-view-container",
            styles.splitViewContainer
          )}
        >
          <For each={childrenArray()} fallback={null}>
            {(child) => {
              const node = child;

              if (isPane(child)) {
                throw Error("Not implemented")
                // splitViewPropsRef.set(node, child.props);

                // return React.cloneElement(child as React.ReactElement, {
                //   key: node,
                //   ref: el => {
                //     if (el) {
                //       splitViewViewRef.set(node, el);
                //     } else {
                //       splitViewViewRef.delete(node);
                //     }
                //   },
                // });
              } else {
                return (
                  <Pane
                    ref={(el: HTMLElement | null) => {
                      if (el) {
                        splitViewViewRef.set(node, el);
                      } else {
                        splitViewViewRef.delete(node);
                      }
                    }}
                  >
                    {child}
                  </Pane>
                );
              }
            }}
          </For>
        </div>
      </div>
    );
  }

Allotment.displayName = "Allotment";

/**
 * Set sash size. This is set in both css and js and this function keeps the two in sync.
 *
 * @param sashSize Sash size in pixels
 */
export function setSashSize(sashSize: number) {
  const size = clamp(sashSize, 4, 20);
  const hoverSize = clamp(sashSize, 1, 8);

  document.documentElement.style.setProperty("--sash-size", size + "px");
  document.documentElement.style.setProperty("--sash-hover-size", hoverSize + "px");

  setGlobalSashSize(size);
}

export default Object.assign(Allotment, { Pane: Pane });
