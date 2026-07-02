package com.standupsync.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.standupsync.dto.Result;
import com.standupsync.dto.TodoCreateDTO;
import com.standupsync.entity.*;
import com.standupsync.mapper.*;
import com.standupsync.websocket.StandupWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class TodoService {

    private final TodoItemMapper todoMapper;
    private final StandupActionItemMapper actionItemMapper;
    private final StandupMeetingMapper meetingMapper;
    private final TeamMemberMapper teamMemberMapper;
    private final UserMapper userMapper;
    private final StandupWebSocketHandler wsHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TodoService(TodoItemMapper todoMapper, StandupActionItemMapper actionItemMapper,
                       StandupMeetingMapper meetingMapper, TeamMemberMapper teamMemberMapper,
                       UserMapper userMapper, StandupWebSocketHandler wsHandler) {
        this.todoMapper = todoMapper;
        this.actionItemMapper = actionItemMapper;
        this.meetingMapper = meetingMapper;
        this.teamMemberMapper = teamMemberMapper;
        this.userMapper = userMapper;
        this.wsHandler = wsHandler;
    }

    private void broadcastTeam(Long teamId, String type, Object payload) {
        try {
            Map<String, Object> msg = new HashMap<>();
            msg.put("type", type);
            msg.put("payload", payload);
            wsHandler.broadcast(String.valueOf(teamId), objectMapper.writeValueAsString(msg));
        } catch (Exception ignored) {}
    }

    private Map<String, Object> _m(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    public Result<?> getTodos(Long teamId, Long userId) {
        List<TodoItem> allTodos = todoMapper.findByTeam(teamId);
        // 团长看到全部，非团长只看自己的
        TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, userId));
        boolean isMaster = tm != null && tm.getRole() != null && tm.getRole() == 2;
        List<TodoItem> todos = new ArrayList<>();
        for (TodoItem t : allTodos) {
            if (isMaster || (t.getAssigneeId() != null && t.getAssigneeId().equals(userId))) {
                todos.add(t);
            }
        }
        return Result.ok(todos);
    }

    /** 获取当前用户所有团队的待办（团长看全团，团员看自己） */
    public Result<?> getMyTodos(Long userId) {
        List<TeamMember> memberships = teamMemberMapper.selectList(
                new LambdaQueryWrapper<TeamMember>().eq(TeamMember::getUserId, userId));
        List<Map<String, Object>> result = new ArrayList<>();
        for (TeamMember tm : memberships) {
            List<TodoItem> teamTodos = todoMapper.findByTeam(tm.getTeamId());
            boolean isMaster = tm.getRole() != null && tm.getRole() == 2;
            for (TodoItem t : teamTodos) {
                if (isMaster || (t.getAssigneeId() != null && t.getAssigneeId().equals(userId))) {
                    User assignee = t.getAssigneeId() != null ? userMapper.selectById(t.getAssigneeId()) : null;
                    User assigner = t.getAssignerId() != null ? userMapper.selectById(t.getAssignerId()) : null;
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", t.getId()); map.put("teamId", t.getTeamId());
                    map.put("content", t.getContent()); map.put("assigneeId", t.getAssigneeId());
                    map.put("assigneeName", assignee != null ? assignee.getNickname() : null);
                    map.put("assignerId", t.getAssignerId());
                    map.put("assignerName", assigner != null ? assigner.getNickname() : null);
                    map.put("priority", t.getPriority());
                    map.put("status", t.getStatus()); map.put("deadline", t.getDeadline());
                    map.put("sprintId", t.getSprintId()); map.put("isOverdue", t.getIsOverdue());
                    map.put("sourceStandupId", t.getSourceStandupId());
                    map.put("completedAt", t.getCompletedAt()); map.put("createTime", t.getCreateTime());
                    result.add(map);
                }
            }
        }
        return Result.ok(result);
    }

    @Transactional
    public Result<?> createTodo(TodoCreateDTO dto, Long assignerId) {
        TodoItem todo = new TodoItem();
        todo.setTeamId(dto.getTeamId());
        todo.setContent(dto.getContent());
        todo.setAssigneeId(dto.getAssigneeId());
        todo.setAssignerId(assignerId);
        todo.setPriority(dto.getPriority() != null ? dto.getPriority() : "medium");
        todo.setStatus("pending");
        todo.setDeadline(dto.getDeadline());
        todo.setSourceStandupId(dto.getSourceStandupId());
        todo.setSprintId(dto.getSprintId());
        todoMapper.insert(todo);
        broadcastTeam(dto.getTeamId(), "todo:created", todo);
        if (dto.getAssigneeId() != null && !dto.getAssigneeId().equals(assignerId)) {
            broadcastTeam(dto.getTeamId(), "todo:assigned",
                _m("teamId", dto.getTeamId(), "todoId", todo.getId(), "assigneeId", dto.getAssigneeId(), "assignerId", assignerId));
        }
        return Result.ok("待办已创建", todo);
    }

    public Result<?> updateStatus(Long todoId, String status, Long userId) {
        TodoItem todo = todoMapper.selectById(todoId);
        if (todo == null) return Result.fail("待办不存在");
        // Permission check: caller must be assignee or a member of the todo's team
        if (!todo.getAssigneeId().equals(userId)) {
            TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                    .eq(TeamMember::getTeamId, todo.getTeamId()).eq(TeamMember::getUserId, userId));
            if (tm == null) return Result.fail("无权修改此待办状态");
        }
        todo.setStatus(status);
        if ("done".equals(status)) todo.setCompletedAt(LocalDateTime.now());
        todoMapper.updateById(todo);
        broadcastTeam(todo.getTeamId(), "todo:status-changed",
            _m("teamId", todo.getTeamId(), "todoId", todoId, "content", todo.getContent(),
               "newStatus", status, "operatorId", userId, "operatorName", "用户" + userId));
        broadcastTeam(todo.getTeamId(), "todo:updated", _m("id", todoId, "status", status));
        return Result.ok("状态已更新");
    }

    public Result<?> getUnfinishedTodos(Long userId) {
        List<TodoItem> list = todoMapper.findUnfinishedByUser(userId);
        return Result.ok(list);
    }

    /** 发起转交请求 */
    public Result<?> requestTransfer(Long todoId, Long newAssigneeId, Long userId) {
        TodoItem todo = todoMapper.selectById(todoId);
        if (todo == null) return Result.fail("待办不存在");
        todo.setTransferToUserId(newAssigneeId);
        todoMapper.updateById(todo);
        broadcastTeam(todo.getTeamId(), "todo:transfer-requested",
            _m("teamId", todo.getTeamId(), "todoId", todoId, "content", todo.getContent(), "fromUserId", userId, "toUserId", newAssigneeId));
        return Result.ok("转交申请已提交，等待团长审批");
    }

    /** 团长审批转交 */
    @Transactional
    public Result<?> approveTransfer(Long todoId, Long userId) {
        TodoItem todo = todoMapper.selectById(todoId);
        if (todo == null) return Result.fail("待办不存在");
        if (todo.getTransferToUserId() == null) return Result.fail("没有待审批的转交请求");
        boolean isMaster = false;
        TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, todo.getTeamId()).eq(TeamMember::getUserId, userId));
        if (tm != null && tm.getRole() != null && tm.getRole() == 2) isMaster = true;
        if (!isMaster) return Result.fail("只有团长可以审批转交");
        Long oldAssigneeId = todo.getAssigneeId();
        todo.setAssigneeId(todo.getTransferToUserId());
        todo.setTransferToUserId(null);
        todoMapper.updateById(todo);
        broadcastTeam(todo.getTeamId(), "todo:transfer-approved",
            _m("teamId", todo.getTeamId(), "todoId", todoId, "content", todo.getContent(),
               "oldAssigneeId", oldAssigneeId, "newAssigneeId", todo.getAssigneeId()));
        return Result.ok("转交成功");
    }

    @Transactional
    public Result<?> generateFromActionItems(Long standupId, Long userId) {
        StandupMeeting meeting = meetingMapper.selectById(standupId);
        if (meeting == null) return Result.fail("站会不存在");
        List<StandupActionItem> items = actionItemMapper.selectList(
                new LambdaQueryWrapper<StandupActionItem>().eq(StandupActionItem::getStandupId, standupId)
                        .eq(StandupActionItem::getIsTodoGenerated, 0));
        int count = 0;
        for (StandupActionItem item : items) {
            TodoItem todo = new TodoItem();
            todo.setTeamId(meeting.getTeamId());
            todo.setAssignerId(userId);
            todo.setContent(item.getContent());
            todo.setAssigneeId(item.getAssigneeId());
            todo.setPriority(item.getPriority());
            todo.setStatus("pending");
            todo.setDeadline(item.getDeadline());
            todo.setSourceStandupId(standupId);
            todoMapper.insert(todo);
            item.setIsTodoGenerated(1);
            item.setTodoId(todo.getId());
            actionItemMapper.updateById(item);
            count++;
        }
        return Result.ok("已生成 " + count + " 个待办");
    }

    // Scheduled task: mark overdue todos every 5 minutes
    @Scheduled(fixedRate = 300000)
    public void markOverdueTodos() {
        int count = todoMapper.markOverdue();
        if (count > 0) System.out.println("Marked " + count + " todos as overdue");
    }
}
