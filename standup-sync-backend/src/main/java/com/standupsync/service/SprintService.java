package com.standupsync.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.standupsync.dto.Result;
import com.standupsync.entity.Sprint;
import com.standupsync.mapper.SprintMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

@Service
public class SprintService {

    private final SprintMapper sprintMapper;

    public SprintService(SprintMapper sprintMapper) {
        this.sprintMapper = sprintMapper;
    }

    public Result<?> listAll() {
        List<Sprint> sprints = sprintMapper.selectList(new LambdaQueryWrapper<Sprint>()
                .orderByDesc(Sprint::getCreateTime));
        return Result.ok(sprints);
    }

    @Transactional
    public Result<?> create(String name, LocalDate startDate, LocalDate endDate) {
        Sprint sprint = new Sprint();
        sprint.setName(name);
        sprint.setStartDate(startDate);
        sprint.setEndDate(endDate);
        sprint.setIsActive(0);
        sprintMapper.insert(sprint);
        return Result.ok("迭代已创建", sprint);
    }
}
