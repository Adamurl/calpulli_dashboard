import { Menu } from "@base-ui/react/menu";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuRadioGroup = Menu.RadioGroup;
export const DropdownMenuRadioItem = Menu.RadioItem;
export const DropdownMenuRadioItemIndicator = Menu.RadioItemIndicator;

export function DropdownMenuContent({
  align = "start",
  ...props
}: Menu.Popup.Props & Pick<Menu.Positioner.Props, "align">) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        sideOffset={4}
        className="dropdown-menu-positioner"
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className="dropdown-menu-content"
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}
