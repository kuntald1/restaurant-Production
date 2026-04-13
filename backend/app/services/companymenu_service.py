from sqlalchemy.orm import Session
from app.models.companymenu_model import Menu


def get_companymenu(db: Session, company_id: int):
    # Fetch all menus for the company
    all_menus = db.query(Menu).filter(
        Menu.companyuniqueid == company_id,
        Menu.isactive == True
    ).all()

    # Convert to dict
    menu_dict = {}
    for menu in all_menus:
        menu_dict[menu.menuid] = {
            "menuid": menu.menuid,
            "menuname": menu.menuname,
            "menudesc": menu.menudesc,
            "menuurl": menu.menuurl,
            "menuicon": menu.menuicon,
            "sortorder": menu.sortorder,
            "isactive": menu.isactive,
            "companyuniqueid": menu.companyuniqueid,
            "parentmenuid": menu.parentmenuid,
            "createdat": menu.createdat,
            "updatedat": menu.updatedat,
            "children": []
        }

    # Build tree — attach children to their parent
    tree = []
    for menu in menu_dict.values():
        parent_id = menu["parentmenuid"]
        if parent_id is None:
            # Top-level menu
            tree.append(menu)
        else:
            # Attach to parent's children list
            if parent_id in menu_dict:
                menu_dict[parent_id]["children"].append(menu)

    return tree