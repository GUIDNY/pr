import { toast } from "sonner";

/** Shown when "add to cart" is pressed on a product the cart already holds.
    The quantity is not touched; it is changed only inside the cart. */
export function toastAlreadyInCart(goToCart: () => void) {
  toast("המוצר כבר בסל", { action: { label: "מעבר לסל", onClick: goToCart } });
}
