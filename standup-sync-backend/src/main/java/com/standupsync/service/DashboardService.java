package com.standupsync.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.standupsync.dto.Result;
import com.standupsync.entity.*;
import com.standupsync.mapper.*;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class DashboardService {

    private final StandupMeetingMapper meetingMapper;
    private final StandupRecordMapper recordMapper;
    private final TodoItemMapper todoMapper;
    private final TeamMemberMapper teamMemberMapper;
    private final UserMapper userMapper;

    public DashboardService(StandupMeetingMapper meetingMapper, StandupRecordMapper recordMapper,
                            TodoItemMapper todoMapper, TeamMemberMapper teamMemberMapper,
                            UserMapper userMapper) {
        this.meetingMapper = meetingMapper;
        this.recordMapper = recordMapper;
        this.todoMapper = todoMapper;
        this.teamMemberMapper = teamMemberMapper;
        this.userMapper = userMapper;
    }

    private LambdaQueryWrapper<StandupMeeting> meetingQuery(Long teamId, String sprintId) {
        LambdaQueryWrapper<StandupMeeting> qw = new LambdaQueryWrapper<StandupMeeting>()
                .eq(StandupMeeting::getTeamId, teamId)
                .in(StandupMeeting::getStatus, "active", "archived");
        if (sprintId != null && !sprintId.isEmpty()) {
            qw.eq(StandupMeeting::getSprint, sprintId);
        }
        return qw;
    }

    public Result<?> getKpiData(Long teamId, String sprintId) {
        List<StandupMeeting> meetings = meetingMapper.selectList(meetingQuery(teamId, sprintId));
        List<TodoItem> todos = todoMapper.findByTeam(teamId);

        int meetingCount = meetings.size();
        int completedTodos = (int) todos.stream().filter(t -> "done".equals(t.getStatus())).count();
        int totalTodos = todos.size();

        // Batch-fetch all records for all meetings (N+1 optimization)
        List<Long> meetingIds = meetings.stream().map(StandupMeeting::getId).collect(Collectors.toList());
        List<StandupRecord> allRecords = meetingIds.isEmpty() ? Collections.emptyList() :
                recordMapper.selectList(new LambdaQueryWrapper<StandupRecord>().in(StandupRecord::getStandupId, meetingIds));
        Map<Long, List<StandupRecord>> recordsByMeeting = allRecords.stream()
                .collect(Collectors.groupingBy(StandupRecord::getStandupId));

        int totalSlots = allRecords.size();
        int filledSlots = (int) allRecords.stream().filter(r -> "done".equals(r.getSpeakStatus())).count();
        int activeBlockers = (int) allRecords.stream().filter(r -> r.getBlockers() != null && !r.getBlockers().trim().isEmpty()).count();
        int attendanceRate = totalSlots > 0 ? filledSlots * 100 / totalSlots : 0;

        int fc = meetingCount, fr = attendanceRate, fb = activeBlockers;
        int fcr = totalTodos > 0 ? Math.toIntExact(Math.round(completedTodos * 100.0 / totalTodos)) : 0;
        Map<String, Object> kpi = new HashMap<>();
        kpi.put("standupCount", new HashMap<String, Object>() {{ put("current", fc); put("previous", fc); put("trend", "stable"); }});
        kpi.put("attendanceRate", new HashMap<String, Object>() {{ put("current", fr); put("previous", fr); put("trend", "stable"); }});
        kpi.put("completionRate", new HashMap<String, Object>() {{ put("current", fcr); put("previous", fcr); put("trend", "stable"); }});
        kpi.put("activeBlockers", new HashMap<String, Object>() {{ put("current", fb); put("previous", fb); put("trend", "stable"); }});
        return Result.ok(kpi);
    }

    public Result<?> getTrendData(Long teamId, String sprintId) {
        List<StandupMeeting> meetings = meetingMapper.selectList(
                meetingQuery(teamId, sprintId).orderByAsc(StandupMeeting::getMeetingDate));

        // Batch-fetch all records and todos (N+1 optimization)
        List<Long> meetingIds = meetings.stream().map(StandupMeeting::getId).collect(Collectors.toList());
        List<StandupRecord> allRecords = meetingIds.isEmpty() ? Collections.emptyList() :
                recordMapper.selectList(new LambdaQueryWrapper<StandupRecord>().in(StandupRecord::getStandupId, meetingIds));
        Map<Long, List<StandupRecord>> recordsByMeeting = allRecords.stream()
                .collect(Collectors.groupingBy(StandupRecord::getStandupId));
        List<TodoItem> allTodos = todoMapper.findByTeam(teamId);
        Map<Long, List<TodoItem>> todosByStandup = allTodos.stream()
                .filter(t -> t.getSourceStandupId() != null)
                .collect(Collectors.groupingBy(TodoItem::getSourceStandupId));

        List<Map<String, Object>> attendanceTrend = new ArrayList<>();
        List<Map<String, Object>> completionTrend = new ArrayList<>();
        List<Map<String, Object>> blockerDistribution = new ArrayList<>();

        for (StandupMeeting m : meetings) {
            List<StandupRecord> records = recordsByMeeting.getOrDefault(m.getId(), Collections.emptyList());
            long done = records.stream().filter(r -> "done".equals(r.getSpeakStatus())).count();
            long total = records.size();
            int attendRate = total > 0 ? (int) (done * 100 / total) : 0;
            attendanceTrend.add(new HashMap<String, Object>() {{ put("date", m.getMeetingDate().toString()); put("value", attendRate); }});

            // Completion trend: compute from todo completion rate for this meeting
            List<TodoItem> meetingTodos = todosByStandup.getOrDefault(m.getId(), Collections.emptyList());
            int todoTotal = meetingTodos.size();
            int todoDone = (int) meetingTodos.stream().filter(t -> "done".equals(t.getStatus())).count();
            int todoRate = todoTotal > 0 ? todoDone * 100 / todoTotal : 0;
            completionTrend.add(new HashMap<String, Object>() {{ put("date", m.getMeetingDate().toString()); put("value", todoRate); }});
        }

        // Blocker distribution (single pass over already-fetched records)
        int tech = 0, res = 0, comm = 0;
        for (StandupRecord r : allRecords) {
            if (r.getBlockers() == null || r.getBlockers().trim().isEmpty()) continue;
            String b = r.getBlockers();
            if (b.contains("技术") || b.contains("bug") || b.contains("API") || b.contains("数据库")) tech++;
            else if (b.contains("沟通") || b.contains("确认") || b.contains("设计")) comm++;
            else res++;
        }
        final int ft = tech, fRes = res, fComm = comm;
        if (ft > 0) blockerDistribution.add(new HashMap<String, Object>() {{ put("name", "技术问题"); put("value", ft); }});
        if (fRes > 0) blockerDistribution.add(new HashMap<String, Object>() {{ put("name", "资源问题"); put("value", fRes); }});
        if (fComm > 0) blockerDistribution.add(new HashMap<String, Object>() {{ put("name", "沟通问题"); put("value", fComm); }});
        if (ft == 0 && fRes == 0 && fComm == 0) blockerDistribution.add(new HashMap<String, Object>() {{ put("name", "暂无数据"); put("value", 1); }});

        Map<String, Object> result = new HashMap<>();
        result.put("attendanceTrend", attendanceTrend);
        result.put("completionTrend", completionTrend);
        result.put("blockerDistribution", blockerDistribution);
        return Result.ok(result);
    }

    public Result<?> getMemberRanking(Long teamId) {
        List<TeamMember> members = teamMemberMapper.selectList(
                new LambdaQueryWrapper<TeamMember>().eq(TeamMember::getTeamId, teamId));
        // Get all standup meeting IDs for this team
        List<Long> teamMeetingIds = meetingMapper.selectList(
                new LambdaQueryWrapper<StandupMeeting>().eq(StandupMeeting::getTeamId, teamId))
                .stream().map(StandupMeeting::getId).collect(Collectors.toList());

        List<Map<String, Object>> ranking = new ArrayList<>();
        String[] medals = {"gold", "silver", "bronze"};
        for (TeamMember m : members) {
            User user = userMapper.selectById(m.getUserId());
            String userName = user != null ? user.getNickname() : ("用户" + m.getUserId());
            // Filter records by user AND by standups within this team
            List<StandupRecord> records = teamMeetingIds.isEmpty() ? Collections.emptyList() :
                    recordMapper.selectList(new LambdaQueryWrapper<StandupRecord>()
                            .eq(StandupRecord::getUserId, m.getUserId())
                            .in(StandupRecord::getStandupId, teamMeetingIds));
            int doneCount = (int) records.stream().filter(r -> "done".equals(r.getSpeakStatus())).count();
            int totalCount = records.size();
            int rate = totalCount > 0 ? doneCount * 100 / totalCount : 0;
            final String un = userName; final int dc = doneCount; final int rt = rate;
            ranking.add(new HashMap<String, Object>() {{ put("name", un); put("doneCount", dc); put("completionRate", rt); put("medal", null); }});
        }
        ranking.sort((a, b) -> Integer.compare((int) b.get("doneCount"), (int) a.get("doneCount")));
        for (int i = 0; i < ranking.size() && i < 3; i++) {
            ranking.get(i).put("medal", medals[i]);
        }
        return Result.ok(ranking);
    }
}
