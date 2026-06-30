package com.standupsync.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.standupsync.dto.Result;
import com.standupsync.entity.Team;
import com.standupsync.entity.TeamMember;
import com.standupsync.entity.User;
import com.standupsync.mapper.TeamMapper;
import com.standupsync.mapper.TeamMemberMapper;
import com.standupsync.mapper.UserMapper;
import com.standupsync.websocket.StandupWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class TeamService {

    private final TeamMapper teamMapper;
    private final TeamMemberMapper teamMemberMapper;
    private final UserMapper userMapper;
    private final StandupWebSocketHandler wsHandler;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TeamService(TeamMapper teamMapper, TeamMemberMapper teamMemberMapper, UserMapper userMapper,
                       StandupWebSocketHandler wsHandler) {
        this.teamMapper = teamMapper;
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> _m(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }

    @Transactional
    public Result<?> createTeam(String name, Long creatorId) {
        Team team = new Team();
        team.setName(name);
        team.setCreatorId(creatorId);
        team.setInviteCode(generateCode());
        teamMapper.insert(team);
        // Auto-join creator as Tech Lead
        TeamMember member = new TeamMember();
        member.setTeamId(team.getId());
        member.setUserId(creatorId);
        member.setRole("tech_lead");
        member.setInviteCode(team.getInviteCode());
        teamMemberMapper.insert(member);
        broadcastTeam(team.getId(), "team:updated", _m("action", "created"));
        return Result.ok("团队创建成功", team);
    }

    @Transactional
    public Result<?> joinTeam(String inviteCode, Long userId) {
        Team team = teamMapper.selectOne(new LambdaQueryWrapper<Team>().eq(Team::getInviteCode, inviteCode));
        if (team == null) return Result.fail("邀请码无效");
        TeamMember exist = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, team.getId()).eq(TeamMember::getUserId, userId));
        if (exist != null) return Result.fail("你已经是团队成员");
        TeamMember member = new TeamMember();
        member.setTeamId(team.getId());
        member.setUserId(userId);
        member.setRole("developer");
        member.setInviteCode(inviteCode);
        teamMemberMapper.insert(member);
        broadcastTeam(team.getId(), "team:member:joined", _m("userId", userId));
        return Result.ok("加入成功", team);
    }

    public Result<?> getTeamMembers(Long teamId) {
        List<TeamMember> members = teamMemberMapper.selectList(
                new LambdaQueryWrapper<TeamMember>().eq(TeamMember::getTeamId, teamId));
        // Attach user names
        List<Map<String, Object>> result = new ArrayList<>();
        for (TeamMember m : members) {
            User user = userMapper.selectById(m.getUserId());
            Map<String, Object> map = new HashMap<>();
            map.put("id", m.getId());
            map.put("teamId", m.getTeamId());
            map.put("userId", m.getUserId());
            map.put("role", m.getRole());
            map.put("joinedAt", m.getJoinedAt());
            map.put("name", user != null ? user.getNickname() : "用户" + m.getUserId());
            map.put("isActive", m.getDeleted() == 0);
            result.add(map);
        }
        return Result.ok(result);
    }

    public Result<?> changeRole(Long teamId, Long memberId, String role, Long operatorId) {
        TeamMember operator = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, operatorId));
        if (operator == null || !"tech_lead".equals(operator.getRole())) return Result.fail("只有Tech Lead可以修改角色");
        TeamMember member = teamMemberMapper.selectById(memberId);
        if (member == null || !member.getTeamId().equals(teamId)) return Result.fail("成员不存在");
        member.setRole(role);
        teamMemberMapper.updateById(member);
        broadcastTeam(teamId, "team:member:role-changed", _m("memberId", memberId, "role", role));
        return Result.ok("角色已更新");
    }

    @Transactional
    public Result<?> removeMember(Long teamId, Long memberId, Long operatorId) {
        TeamMember operator = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, operatorId));
        if (operator == null || !"tech_lead".equals(operator.getRole())) return Result.fail("只有Tech Lead可以移除成员");
        teamMemberMapper.deleteById(memberId);
        broadcastTeam(teamId, "team:member:removed", _m("memberId", memberId));
        return Result.ok("成员已移除");
    }

    public Result<?> getMyTeams(Long userId) {
        List<TeamMember> memberships = teamMemberMapper.selectList(
                new LambdaQueryWrapper<TeamMember>().eq(TeamMember::getUserId, userId));
        if (memberships.isEmpty()) return Result.ok(null);
        List<Long> teamIds = memberships.stream().map(TeamMember::getTeamId).collect(Collectors.toList());
        List<Team> teams = teamMapper.selectBatchIds(teamIds);
        return Result.ok(teams);
    }

    @Transactional
    public Result<?> generateNewInviteCode(Long teamId, Long userId) {
        TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, userId));
        if (tm == null || !"tech_lead".equals(tm.getRole())) return Result.fail("只有Tech Lead可以重新生成邀请码");
        Team team = teamMapper.selectById(teamId);
        team.setInviteCode(generateCode());
        teamMapper.updateById(team);
        broadcastTeam(teamId, "team:updated", _m("inviteCode", team.getInviteCode()));
        return Result.ok(team.getInviteCode());
    }

    public Result<?> updateTeamName(Long teamId, String name, Long userId) {
        TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, userId));
        if (tm == null || !"tech_lead".equals(tm.getRole())) return Result.fail("只有Tech Lead可以修改团队名称");
        Team team = teamMapper.selectById(teamId);
        team.setName(name);
        teamMapper.updateById(team);
        broadcastTeam(teamId, "team:updated", _m("name", name));
        return Result.ok("团队名称已更新");
    }

    @Transactional
    public Result<?> dissolveTeam(Long teamId, Long userId) {
        TeamMember tm = teamMemberMapper.selectOne(new LambdaQueryWrapper<TeamMember>()
                .eq(TeamMember::getTeamId, teamId).eq(TeamMember::getUserId, userId));
        if (tm == null || !"tech_lead".equals(tm.getRole())) return Result.fail("只有Tech Lead可以解散团队");
        teamMapper.deleteById(teamId);
        broadcastTeam(teamId, "team:dissolved", _m("teamId", teamId));
        return Result.ok("团队已解散");
    }

    private String generateCode() {
        return String.format("%06d", new Random().nextInt(1000000));
    }
}
