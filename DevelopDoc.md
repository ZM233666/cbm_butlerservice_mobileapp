---

20260417:
    后端新增与前端联调接口：
    1. 用户管理：
        - GET /api/users?role=&employeeId=
        - POST /api/users
        - POST /api/users/login
    2. 工单创建/派发：
        - GET /api/work-orders?status=&assigneeId=&month=&maint=
        - POST /api/work-orders
        - POST /api/work-orders/:id/dispatch
        - POST /api/work-orders/:id/status
        - 兼容经理入口：POST /api/manager/assignments（已打通同一工单存储）
    3. 完成统计：
        - GET /api/work-orders/stats?month=&assigneeId=&maint=
        - GET /api/manager/dashboard（统计数据已由工单数据驱动）
    4. 首页任务联动：
        - GET /api/home-config?employeeId=xxx 按人员返回派发工单
        - /api/task-status 更新时自动同步工单状态
20260416:
    1. 不需要第三方的角色；
    2. 加入角色/架构管理；
    创建新工单：
    3. 车辆 -- （系统） -- 工单类型；
    4. 去掉Attachment Target，Planned Hours；
    5. To Do的task要选择是否接受；
    6. Task的流转：
        To Do（刚分下来）
          →（用户选择：接受）→ Doing
          →（用户选择：不接受/暂不处理）→ 仍保持 To Do

        Doing
          →（Submit 成功）→ Done
    7. CBM Recommendations功能完善；
---
