-- ============================================================
-- StandupSync 敏捷站会速记工具 — MySQL 8.0 完整建表脚本
-- 引擎: InnoDB | 字符集: utf8mb4 | 排序规则: utf8mb4_unicode_ci
-- ============================================================

CREATE DATABASE IF NOT EXISTS standup_sync
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE standup_sync;

-- ============================================================
-- 1. 用户表 user
-- ============================================================
CREATE TABLE `user` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `username`      VARCHAR(64)   NOT NULL                 COMMENT '登录账号，唯一',
  `password`      VARCHAR(256)  NOT NULL                 COMMENT 'BCrypt加密密码',
  `nickname`      VARCHAR(64)   NOT NULL                 COMMENT '昵称/显示名',
  `avatar`        VARCHAR(512)  DEFAULT ''               COMMENT '头像URL',
  `jwt_token`     VARCHAR(1024) DEFAULT ''               COMMENT '当前JWT令牌(用于黑名单校验)',
  `deleted`       TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';


-- ============================================================
-- 2. 团队表 team
-- ============================================================
CREATE TABLE `team` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `name`          VARCHAR(128)  NOT NULL                 COMMENT '团队名称',
  `creator_id`    BIGINT        NOT NULL                 COMMENT '创建人用户ID',
  `invite_code`   CHAR(6)       NOT NULL                 COMMENT '6位数字邀请码',
  `deleted`       TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_code` (`invite_code`),
  KEY `idx_creator_id` (`creator_id`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队表';


-- ============================================================
-- 3. 团队成员关联表 team_member
-- ============================================================
-- 角色枚举: tech_lead / scrum_master / developer / observer
-- ============================================================
CREATE TABLE `team_member` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `team_id`       BIGINT        NOT NULL                 COMMENT '团队ID',
  `user_id`       BIGINT        NOT NULL                 COMMENT '用户ID',
  `role`          VARCHAR(32)   NOT NULL DEFAULT 'developer' COMMENT '角色 tech_lead/scrum_master/developer/observer',
  `invite_code`   CHAR(6)       DEFAULT ''               COMMENT '加入时使用的邀请码(冗余)',
  `joined_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  `deleted`       TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_team_user` (`team_id`, `user_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_role` (`role`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队成员关联表';


-- ============================================================
-- 4. 站会主表 standup_meeting
-- ============================================================
-- 模式: live(实时轮流) / async(异步填写)
-- 状态: created(已创建) / active(进行中) / archived(已归档) / cancelled(已取消)
-- ============================================================
CREATE TABLE `standup_meeting` (
  `id`                BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `team_id`           BIGINT        NOT NULL                 COMMENT '团队ID',
  `sprint`            VARCHAR(64)   NOT NULL                 COMMENT 'Sprint编号，如 Sprint#12',
  `meeting_date`      DATE          NOT NULL                 COMMENT '站会日期',
  `mode`              VARCHAR(16)   NOT NULL DEFAULT 'live'  COMMENT '站会模式 live=实时轮流 async=异步填写',
  `status`            VARCHAR(16)   NOT NULL DEFAULT 'created' COMMENT '状态 created/active/archived/cancelled',
  `countdown_seconds` INT           NOT NULL DEFAULT 900     COMMENT '倒计时秒数(默认15分钟=900秒)',
  `countdown_end_at`  DATETIME      DEFAULT NULL             COMMENT '倒计时结束时间',
  `is_archived`       TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '是否已归档 0否 1是',
  `archived_at`       DATETIME      DEFAULT NULL             COMMENT '归档时间',
  `created_by`        BIGINT        NOT NULL                 COMMENT '创建人用户ID',
  `deleted`           TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_team_sprint` (`team_id`, `sprint`),
  KEY `idx_status` (`status`),
  KEY `idx_meeting_date` (`meeting_date`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站会主表';


-- ============================================================
-- 5. 成员发言记录表 standup_record
-- ============================================================
-- 发言状态: waiting(未发言) / speaking(发言中) / done(已发言) / skipped(已跳过)
-- ============================================================
CREATE TABLE `standup_record` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `standup_id`      BIGINT        NOT NULL                 COMMENT '站会ID',
  `user_id`         BIGINT        NOT NULL                 COMMENT '发言人用户ID',
  `speak_order`     INT           NOT NULL DEFAULT 0       COMMENT '发言顺序(序号)',
  `yesterday_work`  TEXT                                   COMMENT '昨日完成工作',
  `today_plan`      TEXT                                   COMMENT '今日工作计划',
  `blockers`        TEXT                                   COMMENT '阻碍内容',
  `speak_status`    VARCHAR(16)   NOT NULL DEFAULT 'waiting' COMMENT '发言状态 waiting/speaking/done/skipped',
  `submitted_at`    DATETIME      DEFAULT NULL             COMMENT '提交时间',
  `deleted`         TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_standup_id` (`standup_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_speak_status` (`speak_status`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员发言记录表';


-- ============================================================
-- 6. AI行动项表 standup_action_item
-- ============================================================
-- 优先级: high(高) / medium(中) / low(低)
-- ============================================================
CREATE TABLE `standup_action_item` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `standup_id`      BIGINT        NOT NULL                 COMMENT '站会ID',
  `assignee_id`     BIGINT        NOT NULL                 COMMENT '责任人用户ID',
  `content`         VARCHAR(1024) NOT NULL                 COMMENT '行动项内容',
  `priority`        VARCHAR(16)   NOT NULL DEFAULT 'medium' COMMENT '优先级 high/medium/low',
  `deadline`        DATETIME      DEFAULT NULL             COMMENT '截止时间',
  `is_todo_generated` TINYINT(1)  NOT NULL DEFAULT 0       COMMENT '是否已生成待办 0否 1是',
  `todo_id`         BIGINT        DEFAULT NULL             COMMENT '关联的待办任务ID',
  `sort_order`      INT           NOT NULL DEFAULT 0       COMMENT '排序序号',
  `deleted`         TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_standup_id` (`standup_id`),
  KEY `idx_assignee_id` (`assignee_id`),
  KEY `idx_priority` (`priority`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI行动项表';


-- ============================================================
-- 7. 待办任务表 todo_item
-- ============================================================
-- 状态: pending(待处理) / in_progress(进行中) / done(已完成) / cancelled(已取消)
-- 优先级: high(高) / medium(中) / low(低)
-- ============================================================
CREATE TABLE `todo_item` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT  COMMENT '主键ID',
  `team_id`         BIGINT        NOT NULL                 COMMENT '所属团队ID',
  `content`         VARCHAR(1024) NOT NULL                 COMMENT '任务内容',
  `assignee_id`     BIGINT        NOT NULL                 COMMENT '责任人用户ID',
  `assigner_id`     BIGINT        DEFAULT NULL             COMMENT '分配人用户ID',
  `source_standup_id` BIGINT      DEFAULT NULL             COMMENT '来源站会ID(NULL=手动创建)',
  `priority`        VARCHAR(16)   NOT NULL DEFAULT 'medium' COMMENT '优先级 high/medium/low',
  `status`          VARCHAR(16)   NOT NULL DEFAULT 'pending' COMMENT '状态 pending/in_progress/done/cancelled',
  `deadline`        DATETIME      DEFAULT NULL             COMMENT '截止时间',
  `is_overdue`      TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '是否逾期 0否 1是',
  `completed_at`    DATETIME      DEFAULT NULL             COMMENT '完成时间',
  `deleted`         TINYINT(1)    NOT NULL DEFAULT 0       COMMENT '逻辑删除 0未删 1已删',
  `create_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_status_deadline` (`assignee_id`, `status`, `deadline`),
  KEY `idx_team_id` (`team_id`),
  KEY `idx_source_standup` (`source_standup_id`),
  KEY `idx_priority` (`priority`),
  KEY `idx_is_overdue` (`is_overdue`),
  KEY `idx_deleted` (`deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='待办任务表';


-- ============================================================
-- 初始数据: 插入5个测试用户 (密码均为 123456 的BCrypt加密结果)
-- ============================================================
INSERT INTO `user` (`username`, `password`, `nickname`, `avatar`) VALUES
('zhangsan', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lZ7VqF7tE7v5G1qXO', '张三', ''),
('lisi',     '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lZ7VqF7tE7v5G1qXO', '李四', ''),
('wangwu',   '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lZ7VqF7tE7v5G1qXO', '王五', ''),
('zhaoliu',  '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lZ7VqF7tE7v5G1qXO', '赵六', ''),
('qianqi',   '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lZ7VqF7tE7v5G1qXO', '钱七', '');


-- ============================================================
-- 索引说明汇总
-- ============================================================
-- 1. team_member.uk_team_user:   唯一联合索引, 防重复加入团队
-- 2. standup_record.idx_standup_id: 快速查询单次站会所有发言
-- 3. todo_item.idx_user_status_deadline: 复合索引, 加速待办列表+逾期筛选
-- 4. standup_meeting.idx_team_sprint: 快速筛选迭代内所有站会
-- 5. 所有表均含 idx_deleted 索引, 加速逻辑删除过滤
