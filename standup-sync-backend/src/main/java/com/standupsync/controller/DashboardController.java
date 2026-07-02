package com.standupsync.controller;

import com.standupsync.dto.Result;
import com.standupsync.service.DashboardService;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @GetMapping("/kpi")
    public Result<?> kpi(@RequestParam Long teamId, @RequestParam(required = false) String sprintId,
                         Authentication auth) {
        return dashboardService.getKpiData(teamId, sprintId);
    }

    @GetMapping("/trends")
    public Result<?> trends(@RequestParam Long teamId, @RequestParam(required = false) String sprintId,
                            Authentication auth) {
        return dashboardService.getTrendData(teamId, sprintId);
    }

    @GetMapping("/ranking")
    public Result<?> ranking(@RequestParam Long teamId, Authentication auth) {
        return dashboardService.getMemberRanking(teamId);
    }
}
